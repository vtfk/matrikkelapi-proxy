/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Import dependencies
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
const express = require('express');
const router = express.Router();
const MatrikkelClient = require('../../lib/KartverketMatrikkelAPI/MatrikkelClient');

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Routes
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
router.get('/', async (req, res, next) => {
  try {

  res.setHeader('Content-Type', 'application/json');
  const client = new MatrikkelClient('vtfkBergstrom', '496fPqhJ<qCtu(qAM7Z]', 'https://prodtest.matrikkel.no:443/matrikkelapi/wsapi/v1/MatrikkelenhetServiceWS');
  const polygon = [[10.29960689591465, 59.49699579544128],
    [10.30046509207753, 59.49702009219334],
    [10.30047682231077, 59.496787042682854],
    [10.299854442143015, 59.4967248170461],
    [10.29960689591465, 59.49699579544128]];
  const result = await client.getMatrikkelPolygon(polygon)

  res.type('json').send(JSON.stringify(result, null, 2));
      
  } catch (err) {
    res.type('json').send({ error: err })
    console.log(err);
  }
})

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Exports
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
module.exports = router;
