var socket = null;
var map = null;
var markerClusterer = null;
var markers = [];
var openInfoWindow = null;

function init()
{
    var mapOptions = {
        zoom: 3,
        center: {lat: 20, lng: 0}
    };

    map = new google.maps.Map(
        document.getElementById('map_canvas'),
        mapOptions
    );

    var clustererOptions = {
        gridSize: 40
    };
    markerClusterer = new MarkerClusterer(map, null, clustererOptions);
    
    if (io !== undefined)
    {
        socket = io.connect('/');
        
        socket.on("tracking", function(tracking)
        {
            var tracking_info = document.getElementById("tracking_info");
            var tracking_box = document.getElementById("tracking_box");
            tracking_box.style.visibility = "visible";
            
            var trackingText = "";
            if (tracking.all == true)
            {
                trackingText = "All tweets";
            }
            else if (tracking.trends_from)
            {
                trackingText = "Top trends from " + tracking.trends_from
                         + ". [" + tracking.keywords.join(", ") + "]";
            }
            else if (tracking.keywords)
            {
                trackingText = tracking.keywords.join(", ");
            }
            else
            {
                tracking_box.style.visibility = "hidden";
            }

            tracking_info.innerHTML = trackingText;
        });

        socket.on("twitter-stream", function(tweet)
        {
            var marker = new google.maps.Marker({
                position: {
                    lat: tweet.coordinates.lat,
                    lng: tweet.coordinates.lng
                },
                animation: google.maps.Animation.DROP
            });

            var infoWinContent = '<div id="content">'
                + '<div id="siteNotice">'
                + '</div>'
                + '<h1 id="firstHeading" class="firstHeading">'
                + tweet.display_name + ' (@' + tweet.twitter_handle + '):</h1>'
                + '<div id="bodyContent"><p style="font-weight:bold;">'
                    + tweet.time + '</b></p>'
                + '<p>' + tweet.text + '</p>'
                + '</div>'
                + '</div>';
            marker.infowindow = new google.maps.InfoWindow({
                content: infoWinContent
            });

            addMarker(marker);
        });

        socket.on("connected", function(r)
        {
            socket.emit("tracking what");
            clearMarkers();
            socket.emit("start tweets");
        });
    }
}

function addMarker(marker)
{
    marker.setMap(map);
    markers.push(marker);
    if (markerClusterer !== null)
    {
        // Add to cluster after 0.5s so the marker drop animation can be seen
        setTimeout(function()
        {
            markerClusterer.addMarker(marker);
        }, 500);
    }
    if (marker.infowindow !== null)
    {
        marker.addListener('click', function() {
            if (openInfoWindow !== null)
            {
                openInfoWindow.close();
            }
            marker.infowindow.open(map, marker);
            openInfoWindow = marker.infowindow;
        });
    }
}

function clearMarkers()
{
    if (markerClusterer !== null)
    {
        markerClusterer.clearMarkers();
    }
    markers.forEach(function(marker)
    {
        marker.setMap(null);
    });
    markers = [];
}

function resetZoom()
{
    if (map !== null)
    {
        map.setZoom(3);
        map.setCenter({lat: 20, lng: 0});
    }
}

function stopStream()
{
    if (socket !== null)
    {
        socket.emit("stop tweets");
    }
}
