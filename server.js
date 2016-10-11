// Dependencies
var twitter = require('twitter'),
    express = require('express'),
    http = require('http'),
    socketio = require('socket.io');

// Setup server and socket
var app = express(),
    server = http.createServer(app),
    io = socketio.listen(server);

// Setup twitter stream API
var twitter_api = new twitter({
    consumer_key: process.env.TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
    access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
});
var stream = null;

app.set("port", process.env.PORT || 8088)
app.use("/js", express.static(__dirname + "/public/js"));
app.use("/css", express.static(__dirname + "/public/css"));
app.use("/images", express.static(__dirname + "/public/images"));

var streamParams = {};
var tracking = {};
app.get("/", function(req, res)
{
    // First check if tracking keywords were provided
    if (req.query.track)
    {
        streamParams = {track: req.query.track};

        tracking = {};
        tracking.keywords = req.query.track.split(",");
    }
    // If not, check if trends for a given WOEID were requested to be tracked
    else if (req.query.trends_woeid)
    {
        twitter_api.get("trends/place", {id: req.query.trends_woeid}, function(error, result, response)
        {
            var trends = [];
            result[0].trends.forEach(function(trend)
            {
                trends.push(trend.name);
            });
            streamParams = {track: trends.join()};

            tracking = {};
            tracking.trends_from = result[0].locations[0].name;
            tracking.keywords = trends;
        });
    }
    // Otherwise just get all tweets with a location and display them
    else if (req.query.track_all == "true")
    {
        streamParams = {locations: "-180,-90,180,90"};

        tracking = {};
        tracking.all = true;
    }

    res.sendFile("index.html", {root: __dirname + "/public"});
});

// Listen on default port or use 8088 for localhost
server.listen(app.get("port"), function()
{
    console.log("Express server listening on port " + app.get("port"));
});

// Create web sockets connection
io.sockets.on("connection", function(socket)
{
    socket.emit("connected");

    // Inform client of what is being tracked
    socket.on("tracking what", function()
    {
        socket.emit("tracking", tracking);
    });

    socket.on("start tweets", function()
    {
        if (streamParams.track != undefined
                || streamParams.locations != undefined)
        {
            console.log("streamParams = " + JSON.stringify(streamParams, null, 2));
            if (stream !== null)
            {
                stream.destroy();
            }
            // Connect to twitter stream with location filter for whole world
            twitter_api.stream("statuses/filter", streamParams, function(s)
            {
                stream = s;
                stream.on("data", function(tweet)
                {
                    // Check there were coordinates in retrieved tweets
                    if (tweet.coordinates)
                    {
                        if (tweet.coordinates !== null)
                        {
                            /*
                             * Construct JSON of the parts of the tweet we care
                             * about to output over web socket
                             */
                            var tweet = {
                                "twitter_handle": tweet.user.screen_name,
                                "display_name": tweet.user.name,
                                "text": tweet.text,
                                "time": tweet.created_at,
                                "coordinates": {
                                    "lng": tweet.coordinates.coordinates[0],
                                    "lat": tweet.coordinates.coordinates[1]
                                }
                            };
                            console.log(JSON.stringify(tweet, null, 2));

                            socket.emit("twitter-stream", tweet);
                        }
                    }
                });

                stream.on("error", function(error)
                {
                    console.log(error);
                    throw error;
                });
            });
        }
    });

    socket.on("stop tweets", function()
    {
        if (stream !== null)
        {
            console.log("Tweet stream stopped.");
            stream.destroy();
        }
    });
});
