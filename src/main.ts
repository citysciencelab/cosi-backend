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
  districtLevel: {label: "Stadtteile"},
  stats: ["bev_insgesamt"],
  layers: {
    point: [
      // ["5246"],
      ["8712", "kapitelbezeichnung", "anzahl_schueler"]
    ],
    polygon: [
      // ["5152", "versickerungswahrscheinlichkeit"],
      ["1605", "nutzung"],
      [["20593", "20594", "1534"], undefined, "flaeche_qm"]
    ],
    line: [
      [["20609", "20610"]]
      // [["20609", "20610", "20611", "20612", "20613", "20614", "20615"]]
    ]
  }
})
