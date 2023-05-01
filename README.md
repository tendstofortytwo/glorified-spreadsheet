# glorified spreadsheet

a simple web app built to track my finances.

**warning:** do not use this to track your finances! it will most likely screw up eventually.

to deploy:

```
    cd glorified-spreadsheet
    npm i
    vim config.pii.js
    node index.js
```

add the following content to `config.pii.js`:

```
import { readFileSync } from 'fs';

const config = {
    port: 3001,
    https: {
        cert: readFileSync(PATH_TO_YOUR_HTTPS_CERT),
        key: readFileSync(PATH_TO_YOUR_HTTPS_PRIVATE_KEY)
    },
    db: 'database.db',
};

export default config;
```

runs on port 3000 if you don't specify a port, does not use https if you don't specify a cert, stores data in a file called `blockchain.db` if you don't specify a db filename.

## license

MIT license, see LICENSE.md.

