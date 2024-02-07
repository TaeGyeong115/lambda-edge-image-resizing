const querystring = require('querystring');
const AWS = require('aws-sdk');
const Sharp = require('sharp');

const S3 = new AWS.S3({region: 'ap-northeast-2'});
const BUCKET = {bucker_name};
const allowedExtension = [ "jpg", "jpeg", "png", "webp" ];

const MAX_HEIGHT = 1024;
const MAX_WIDTH = 1024;
const DEFAULT_QUALITY= 90;
const MAX_IMAGE_MB = 2;

exports.handler = async (event, context, callback) => {
  const {request, response} = event.Records[0].cf;
  const params = querystring.parse(request.querystring);
  let {w, h, q, f} = params

  const {uri} = request;
  const [, imageName, extension] = uri.match(/\/?(.*)\.(.*)/);

  if (!(w || h || q || f)) {
    return callback(null, response);
  }

  if (w && w > MAX_WIDTH) {
    w = MAX_WIDTH;
  }

  if (h && h > MAX_HEIGHT) {
    h = MAX_HEIGHT;
  }

  if (!allowedExtension.includes(extension)) {
    console.log(`${extension} is not allowed`);
    response.status = 400;
    response.headers['content-type'] = [{
      key: 'Content-Type',
      value: 'text/plain'
    }];
    response.body = `${extension} is not allowed`;
    return callback(null, response);
  }

  let s3Object;
  let KEY = decodeURI(imageName + '.' + extension)
  try {
    s3Object = await S3.getObject({
      Bucket: BUCKET,
      Key: KEY
    }).promise();
  } catch (error) {
    response.status = 404;
    response.headers['content-type'] = [{
      key: 'Content-Type',
      value: 'text/plain'
    }];
    response.body = `Bad Request: contents is not found`;
    return callback(null, response);
  }

  let resizedImage;
  let quality = parseInt(q, 10) ? parseInt(q, 10) : DEFAULT_QUALITY;
  let format = f ? f : extension;
  format = format === 'jpg' ? 'jpeg' : format;
  quality = format === 'webp' ? 100 : quality;

  let width = parseInt(w, 10) ? parseInt(w, 10) : null;
  let height = parseInt(h, 10) ? parseInt(h, 10) : null;
  try {
    const originImage = await s3Object;
    if ((originImage.ContentLength || 0) > (1048576 * MAX_IMAGE_MB)) {
      return callback(null, response);
    }

    resizedImage = await Sharp(s3Object.Body)
    .resize(width, height, {fit: 'inside'})
    .toFormat(format, {quality, alphaQuality: DEFAULT_QUALITY})
    .toBuffer()
  } catch (error) {
    console.log('Sharp: ', error);
    return callback(null, response);
  }

  if (Buffer.byteLength(resizedImage, 'base64') > (1048576 * MAX_IMAGE_MB)) {
    return callback(null, response);
  }

  response.status = 200;
  response.body = resizedImage.toString('base64');
  response.bodyEncoding = 'base64';
  response.headers['content-type'] = [{
    key: 'Content-Type',
    value: `image/${format}`
  }];
  return callback(null, response);
};