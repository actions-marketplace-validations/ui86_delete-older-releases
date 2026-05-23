"use strict";

const https = require("https");

/**
 * 发送 HTTP 请求的封装方法 (HTTP Request Wrapper)
 * 
 * @param {https.RequestOptions} options - HTTPS 请求选项 (HTTPS request options)
 * @param {string} [data] - 要发送的请求体数据 (Request body data to send)
 * @returns {Promise<any>} 返回包含响应数据的 Promise (Returns a Promise resolving to the parsed response)
 */
module.exports = function fetch(options, data) {
  return new Promise(function (resolve, reject) {
    const req = https.request(options, function (res) {
      let responseData = "";
      
      // 收集数据块 (Collect data chunks)
      res.on("data", function (chunk) {
        responseData += chunk;
      });

      // 响应结束处理 (Response end handling)
      res.on("end", function () {
        let body = undefined;
        try {
          body = responseData ? JSON.parse(responseData) : undefined;
        } catch (e) {
          return reject(new Error(`JSON 解析失败 (Failed to parse JSON): ${e.message}`));
        }

        // 处理非 2xx 状态码 (Handle non-2xx status codes)
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(body ? body.message : res.statusMessage));
        }

        return resolve(body);
      });
    });

    // 处理请求错误 (Handle request errors)
    req.on("error", function (err) {
      reject(new Error(`网络请求失败 (Network request failed): ${err.message}`));
    });

    // 写入请求体并结束请求 (Write request body and end request)
    if (data) {
      req.write(data);
    }
    req.end();
  });
};
