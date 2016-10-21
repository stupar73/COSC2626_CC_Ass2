// Dependencies
var twitter = require('twitter'),
    express = require('express'),
    http = require('http'),
    socketio = require('socket.io'),
    aws = require('aws-sdk');

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

// Setup AWS
aws.config.region = process.env.DDB_REGION;
var dynamodb = new aws.DynamoDB.DocumentClient();
var trendsTable = process.env.TRENDS_TABLE;

// Setup server
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
            // Create array of all trends to track for this WOEID
            var trends = [];
            result[0].trends.forEach(function(trend)
            {
                trends.push(trend.name);
            });
            streamParams = {track: trends.join()};

            // Create tracking object used to inform client what's being tracked
            tracking = {
                woeid: result[0].locations[0].woeid,
                trends_from: result[0].locations[0].name,
                keywords: trends
            };
            
            // Insert these trends into DynamoDB
            var updateString = "SET  location_name = :location_name, historical_trends = list_append(if_not_exists(historical_trends, :empty_list), :new)"
            var params = {
                TableName: trendsTable,
                Key: {
                    woeid: tracking.woeid
                },
                UpdateExpression: updateString,
                ExpressionAttributeValues: {
                    ":location_name": tracking.trends_from,
                    ":empty_list": [],
                    ":new": [
                        {
                            created_at: result[0].created_at,
                            trends: result[0].trends
                        }
                    ]
                }
            };
            dynamodb.update(params, function(err, data)
            {
                if (err)
                {
                    console.error("Error occured while attempting to insert "
                            + "trends into DynamoDB.\n", JSON.stringify(err, null, 2));
                }
            });
        });
    }
    // Otherwise check if all tweets with location were requested
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

    socket.on("start tweets", function()
    {
        if (streamParams.track != undefined
                || streamParams.locations != undefined)
        {
            console.log("streamParams = " + JSON.stringify(streamParams, null, 2));
            socket.emit("tracking", tracking);
            if (stream !== null)
            {
                stream.destroy();
            }
            // Connect to twitter stream with location filter for whole world
            twitter_api.stream("statuses/filter", streamParams, function(s)
            {
                stream = s;
                stream.on("data", function(data)
                {
                    // Check there were coordinates in retrieved tweets
                    if (data.coordinates)
                    {
                        if (data.coordinates !== null)
                        {
                            /*
                             * Construct JSON of the parts of the tweet we care
                             * about to output over web socket
                             */
                            var tweet = {
                                twitter_handle: data.user.screen_name,
                                display_name: data.user.name,
                                text: data.text,
                                time: data.created_at,
                                coordinates: {
                                    lng: data.coordinates.coordinates[0],
                                    lat: data.coordinates.coordinates[1]
                                }
                            };
                            console.log("Tweet found from ("
                                    + tweet.coordinates.lng + ", "
                                    + tweet.coordinates.lat + ")");

                            socket.emit("twitter-stream", tweet);
                        }
                    }
                });

                stream.on("error", function(err)
                {
                    console.error(JSON.stringify(err, null, 2));
                    throw err;
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
        stream = null;
        streamParams = {};
        tracking = {};
    });
});
