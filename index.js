const express = require('express');
const mongo = require('mongodb').MongoClient;
const https = require('https');
const path = require('path');
const app = express();

const baseUrl = 'https://www.googleapis.com/customsearch/v1';

app.set('port', (process.env.PORT || 5000));

app.use(express.static(path.join(__dirname, '/public')));

app.get('/', (_, res) => {
  res.sendFile('index.html');
});

app.get('/api/:query', (req, res) => {
  const page = getPageFromRequest(req);

  console.log(req.originalUrl);

  getImages(req.params.query, page)
    .then(
      (json) => {
        const imageArray = projectSearchResult(json);
        res.json(imageArray);

        return imageArray;
      },
      (err) => {
        res.status(500).end(err);
      }
    );

  persistQuery(req.originalUrl);
});

app.get('/latest', (req, res) => {
  queryLastQueriesArray()
    .then(arr => res.json(arr))
    .catch(() => res.status(500).end("An error occurred while fetching the latest queries"));
});

const getImages = (query, page = 1) => {
  const url = baseUrl
    + `?cx=${process.env.SEARCH_CX}`
    + `&q=${query}`
    + '&searchType=image'
    + `&start=${ (page - 1) * 10 + 1 }`
    + `&key=${process.env.SEARCH_KEY}`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const statusCode = res.statusCode;
      const contentType = res.headers['content-type'];

      let error;
      if (statusCode !== 200) {
        error = new Error(`Request Failed.\n` +
          `Status Code: ${statusCode}`);
      } else if (!/^application\/json/.test(contentType)) {
        error = new Error(`Invalid content-type.\n` +
          `Expected application/json but received ${contentType}`);
      }
      if (error) {
        console.log(error.message);
        res.resume();
        return reject("An error occurred while making the request to an external API [1]");
      }

      res.setEncoding('utf8');
      let rawData = '';
      res.on('data', (chunk) => rawData += chunk);
      res.on('end', () => {
        try {
          let parsedData = JSON.parse(rawData);
          resolve(parsedData);
        } catch (e) {
          reject("An error occurred parsing the return JSON string")
        }
      });
    }).on('error', (e) => {
      console.log(`Got error: ${e.message}`);
      reject("An error occurred while making the request to an external API [2]");
    });
  });
};

const getPageFromRequest = (req) => {
  try {
    const page = parseInt(req.query.offset);
    return page > 0 ? page : 1;
  }
  catch (e) {
    return 1;
  }
};

const projectSearchResult = (json) => {
  try {
    let returnArr = [];

    json.items.forEach(i => {
      const { link, title, displayLink } = i;

      returnArr.push({
        link: link,
        alt: title,
        foundOn: displayLink
      });
    });

    return returnArr;
  }
  catch (e) {
    return { error: "An error occurred while parsing the return JSON string" };
  }
};

const persistQuery = (query) => {
  mongo.connect(process.env.MDLABS_SHORTLY)
    .then(
      (db) => {
        db.collection('imageQueries')
          .insertOne({
            date: (new Date()).toDateString(),
            q: query
          })
          .then(
            () => console.log(`Insert: ${query}`),
            (err) => console.error(`Failed persisting a query: ${err}. Query: ${query}`)
          )
          .then(() => db.close());
      }
    )
    .catch((err) => console.error(`Failed on connecting to DB: ${err}`));
};

const queryLastQueriesArray = () => {
  return new Promise((resolve, reject) => {
    mongo.connect(process.env.MDLABS_SHORTLY)
      .then(
        (db) => {
          resolve(
            db.collection('imageQueries')
              .find().sort({ $natural: -1 }).limit(10)
              .toArray()
          );
        }
      )
      .catch((err) => {
        console.error(`Failed on connecting to DB: ${err}`);
        reject();
      });
  });
};

app.listen(app.get('port'), function () {
  console.log('Node app is running on port', app.get('port'));
});