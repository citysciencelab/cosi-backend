import express from 'express'
import SpatialScreening from './modules/SpatialScreening/SpatialScreening';
import config from "./utils/config.loader"

const app = express();
const port = config.port;

app.get('/', (req, res) => {
  res.send('The sedulous hyena ate the antelope!');
})

app.listen(port, () => {
  return console.log(`server is listening on ${port}`)
});

const screening = new SpatialScreening({
  districtLevel: {label: "Statistische Gebiete"},
  layers: {
    point: ["146"]
  }
})