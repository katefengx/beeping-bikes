import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';


console.log('Mapbox GL JS Loaded:', mapboxgl);

// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1Ijoia2F0ZWZlbmciLCJhIjoiY21ha3BreW80MDBlazJsb29kcnFzMXJvciJ9.Qcw_e6jsu2LJg34u9-z_4g';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/light-v11', // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18, // Maximum allowed zoom
});

map.on('load', async () => {

  let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

  
  map.addSource('boston_route', {
      type: 'geojson',
      data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
  });
  
  map.addLayer({
    id: 'bike-lanes',
    type: 'line',
    source: 'boston_route',
    paint: {
      'line-color': '#3D8C40',  // A bright green using hex code
      'line-width': 5,          // Thicker lines
      'line-opacity': 0.6       // Slightly less transparent
    },
  });

  map.addSource('cambridge_route', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson',
  });

  map.addLayer({
    id: 'cambridge_lanes',
    type: 'line',
    source: 'cambridge_route',
    paint: {
      'line-color': '#3D8C40', 
      'line-width': 5,          // Thicker lines
      'line-opacity': 0.6       // Slightly less transparent
    },
  });

  let jsonData;
  try {
    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';

    // Await JSON fetch
    jsonData = await d3.json(jsonurl);

    console.log('Loaded JSON Data:', jsonData); // Log to verify structure

  } catch (error) {
    console.error('Error loading JSON:', error); // Handle errors
    
  }

  let trips = await d3.csv("https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv", d => ({
    ride_id: d.ride_id,
    bike_type: d.bike_type,
    started_at: new Date(d.started_at),
    ended_at: new Date(d.ended_at),
    start_station_id: d.start_station_id,
    end_station_id: d.end_station_id,
    is_member: +d.is_member
  }));

  for (const trip of trips) {
    let startedMinutes = minutesSinceMidnight(trip.started_at);
    let endedMinutes = minutesSinceMidnight(trip.ended_at);
    departuresByMinute[startedMinutes].push(trip);
    arrivalsByMinute[endedMinutes].push(trip);
  }

  let stations = computeStationTraffic(jsonData.data.stations);

  console.log('Stations Array:', stations);

  // Reposition markers on map interactions
  map.on('move', updatePositions); // Update during map movement
  map.on('zoom', updatePositions); // Update during zooming
  map.on('resize', updatePositions); // Update on window resize
  map.on('moveend', updatePositions); // Final adjustment after movement ends

  function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
  }

  const departures = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.start_station_id,
  );

  const arrivals = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.end_station_id,
  );

  stations = stations.map((station) => {
    let id = station.short_name;
    station.arrivals = arrivals.get(id) ?? 0;
    station.departures = departures.get(id) ?? 0;
    station.totalTraffic = station.arrivals + station.departures;
    return station;
  });
  console.log(stations);

  const radiusScale = d3
    .scaleSqrt()
    .domain([0, d3.max(stations, (d) => d.totalTraffic)])
    .range([0, 25]);

  const svg = d3.select('#map').select('svg');
  const circles = svg
    .selectAll('circle')
    .data(stations, (d) => d.short_name) // Use station short_name as the key
    .enter()
    .append('circle')
    .attr('r', d => radiusScale(d.totalTraffic)) // Radius of the circle
    .attr('fill', 'steelblue') // Circle fill color
    .attr('stroke', 'white') // Circle border color
    .attr('stroke-width', 1) // Circle border thickness
    .attr('opacity', 0.8) // Circle opacity
    .style('--departure-ratio', (d) =>
      stationFlow(d.departures / d.totalTraffic),
    )
    .each(function (d) {
      // Add <title> for browser tooltips
      d3.select(this)
        .append('title')
        .text(
          `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`,
        );
    }
  );

  // Function to update circle positions when the map moves/zooms
  function updatePositions() {
    circles
      .attr('cx', (d) => getCoords(d).cx) // Set the x-position using projected coordinates
      .attr('cy', (d) => getCoords(d).cy); // Set the y-position using projected coordinates
  }

  // Initial position update when map loads
  updatePositions();

  // TIME SLIDER
  const timeSlider = document.getElementById('time-slider');
  const selectedTime = document.getElementById('selected-time');
  const anyTimeLabel = document.getElementById('any-time');

  function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes); // Set hours & minutes
    return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
  }

let timeFilter = -1; 

function updateTimeDisplay() {
  timeFilter = Number(timeSlider.value); // Assign updated value
  if (timeFilter === -1) {
    selectedTime.textContent = '';
    anyTimeLabel.style.display = 'block';
  } else {
    selectedTime.textContent = formatTime(timeFilter);
    anyTimeLabel.style.display = 'none';
  }

  // Call updateScatterPlot to reflect the changes on the map
  updateScatterPlot(timeFilter);
}

function updateScatterPlot(timeFilter) {
  const filteredStations = computeStationTraffic(stations, timeFilter);

  timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);

  // Update the scatterplot by adjusting the radius of circles
  circles
    .data(filteredStations, (d) => d.short_name) // Ensure D3 tracks elements correctly
    .join('circle') // Ensure the data is bound correctly
    .attr('r', (d) => radiusScale(d.totalTraffic)) // Update circle sizes
    .style('--departure-ratio', (d) =>
      stationFlow(d.departures / d.totalTraffic),
    );
}

  timeSlider.addEventListener('input', updateTimeDisplay);
  updateTimeDisplay();

});

let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
  const { x, y } = map.project(point); // Project to pixel coordinates
  return { cx: x, cy: y }; // Return as object for use in SVG attributes
}

function filterByMinute(tripsByMinute, minute) {
  if (minute === -1) {
    return tripsByMinute.flat(); // No filtering, return all trips
  }

  // Normalize both min and max minutes to the valid range [0, 1439]
  let minMinute = (minute - 60 + 1440) % 1440;
  let maxMinute = (minute + 60) % 1440;

  // Handle time filtering across midnight
  if (minMinute > maxMinute) {
    let beforeMidnight = tripsByMinute.slice(minMinute);
    let afterMidnight = tripsByMinute.slice(0, maxMinute);
    return beforeMidnight.concat(afterMidnight).flat();
  } else {
    return tripsByMinute.slice(minMinute, maxMinute).flat();
  }
}

function computeStationTraffic(stations, timeFilter = -1) {
  // Retrieve filtered trips efficiently
  const departures = d3.rollup(
    filterByMinute(departuresByMinute, timeFilter), // Efficient retrieval
    (v) => v.length,
    (d) => d.start_station_id
  );

  const arrivals = d3.rollup(
    filterByMinute(arrivalsByMinute, timeFilter), // Efficient retrieval
    (v) => v.length,
    (d) => d.end_station_id
  );

  return stations.map(station => {
    const id = station.short_name;
    station.arrivals = arrivals.get(id) || 0;
    station.departures = departures.get(id) || 0;
    station.totalTraffic = station.arrivals + station.departures;
    return station;
  });
}

//map.on('load, async() => ...)
// inside: add data sources/layers, add layers, adding custom controls or ui tied ot map, setting specific styles filters or paints after style loads, any async code that depends on map being ready
// outside: instantiating map, setting up html controls, uoi buttons , sliders, declaring variables/global configs/styles, functions that do not depend on ap being fully styled, helper functions to be used inside map load