# D3 Weather Risk Dashboard

## Run

Do not open `index.html` directly with `file://`, because the browser may block `d3.csv()`.
Run a local server in this folder:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Files

- `index.html`: layout + D3 CDN
- `style.css`: dashboard UI
- `script.js`: data processing + D3 charts
- `weather.csv`: source dataset
- `vietnam-provinces.geojson`: Vietnam 63-province geometry for choropleth map

## Dashboard tasks

1. Risk Map: 63-province choropleth colored by average risk score.
2. Sorted Stacked Bar: province priority + risk driver contribution.
3. Alert Timeline: time-series alert pattern.

## Map data

Province polygons are from GADM 4.1 Vietnam level-1 GeoJSON, kept local so the dashboard can render the map without another network request.

## Important limitation

This dashboard does not predict actual pest/disease occurrence. It creates a weather-driven risk screening score from rain, humidity, wind, visibility, and weather condition.
