const { builder } = require("@netlify/functions");
const chromium = require("chrome-aws-lambda");

function isFullUrl(url) {
  try {
    new URL(url);
    return true;
  } catch(e) {
    return false;
  }
}

async function screenshot(url, { format, viewport, dpr = 1, withJs = true, wait, timeout = 8500 }) {
  timeout = Math.min(Math.max(timeout, 3000), 8500);

  const browser = await chromium.puppeteer.launch({
    executablePath: await chromium.executablePath,
    args: chromium.args,
    defaultViewport: {
      width: viewport[0],
      height: viewport[1],
      deviceScaleFactor: parseFloat(dpr),
    },
    headless: chromium.headless,
  });

  const page = await browser.newPage();

  if(!withJs) {
    page.setJavaScriptEnabled(false);
  }

  let response = await Promise.race([
    page.goto(url, {
      waitUntil: wait || ["load"],
      timeout,
    }),
    new Promise(resolve => {
      setTimeout(() => resolve(false), timeout - 1500);
    }),
  ]);

  if(response === false) {
    await page.evaluate(() => window.stop());
  }

  let options = {
    type: format,
    encoding: "base64",
    fullPage: false,
    captureBeyondViewport: false,
    clip: {
      x: 0,
      y: 0,
      width: viewport[0],
      height: viewport[1],
    }
  };

  if(format === "jpeg") {
    options.quality = 99;
  }

  let output = await page.screenshot(options);

  await browser.close();

  return output;
}

// ... (rest of the script remains the same)

async function handler(event, context) {
  let pathSplit = event.path.split("/").filter(entry => !!entry);
  let [encodedUrl, customSize, format] = pathSplit.slice(pathSplit.length - 3); // Extract the last three segments of the path
  let viewport = [800, 640]; // Default size

  if (customSize) {
    let dimensions = customSize.split('x').map(Number);
    if (dimensions.length === 2 && dimensions.every(n => !isNaN(n))) {
      viewport = dimensions;
    }
  }

  // Replace '___' with actual slashes
  let url = decodeURIComponent(encodedUrl).replace(/___/g, '/');
  format = format || "jpeg"; // Default format

  try {
    if(!isFullUrl(url)) {
      throw new Error(`Invalid \`url\`: ${url}`);
    }

    let output = await screenshot(url, {
      format,
      viewport,
      dpr: 1, // Default device pixel ratio
      wait: ["load"]
    });

    console.log(url, format, { viewport });

    return {
      statusCode: 200,
      headers: {
        "content-type": `image/${format}`
      },
      body: output,
      isBase64Encoded: true
    };
  } catch (error) {
    console.log("Error", error);

    return {
      statusCode: 500,
      headers: {
        "content-type": "text/plain"
      },
      body: `Error: ${error.message}`,
    };
  }
}

exports.handler = builder(handler);