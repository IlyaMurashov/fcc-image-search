const express = require('express');
const mongo = require('mongodb').MongoClient;
const https = require('https');
const app = express();

const baseUrl = 'https://www.googleapis.com/customsearch/v1';

app.set('port', (process.env.PORT || 5000));

app.get('/api/:query', (req, res) => {
  const page = getPageFromRequest(req);

  getImages(req.params.query, page)
    .then(
      (json) => res.json(projectSearchResult(json)),
      (err) => res.status(500).end(err)
    );
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
      const {link, title, displayLink} = i;

      returnArr.push({
        link: link,
        alt: title,
        foundOn: displayLink
      });
    });

    return returnArr;
  }
  catch (e) {
    return {error: "An error occurred while parsing the return JSON string"};
  }
};

app.listen(app.get('port'), function () {
  console.log('Node app is running on port', app.get('port'));
});