/* One Vercel function serves the whole API (see lib/api.js). */
'use strict';
const { handle } = require('../lib/api');
module.exports = (req, res) => handle(req, res);
