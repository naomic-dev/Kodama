const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.CONFIG_PATH = path.join(__dirname, 'fixtures', 'test-config.json');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kodama-test-'));
process.env.LOG_LEVEL = 'error';
process.env.LOG_FORMAT = 'text';
