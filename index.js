"use strict";

const fetch = require("./fetch");

/**
 * 读取并验证环境变量配置
 * (Reads and validates environment variable configurations)
 * @returns {Object} 配置对象 (Configuration object)
 */
function getConfig() {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error("🔴 no GITHUB_TOKEN found. pass `GITHUB_TOKEN` as env");
  }

  if (!process.env.GITHUB_REPOSITORY) {
    throw new Error("🔴 no GITHUB_REPOSITORY found. pass `GITHUB_REPOSITORY` as env");
  }

  if (!process.env.INPUT_REPO) {
    console.warn("💬  no `repo` name given. fall-ing back to this repo");
  }

  const [owner, repo] = (process.env.INPUT_REPO || process.env.GITHUB_REPOSITORY).split("/");

  if (!owner || !repo) {
    throw new Error("☠️  either owner or repo name is empty. exiting...");
  }

  if (!process.env.INPUT_KEEP_LATEST) {
    throw new Error("✋🏼  no `keep_latest` given. exiting...");
  }

  const keepLatest = Number(process.env.INPUT_KEEP_LATEST);
  if (Number.isNaN(keepLatest) || keepLatest < 0) {
    throw new Error("🤮  invalid `keep_latest` given. exiting...");
  }

  if (keepLatest === 0) {
    console.warn("🌶  given `keep_latest` is 0, this will wipe out all releases");
  }

  const shouldDeleteTags = process.env.INPUT_DELETE_TAGS === "true";
  if (shouldDeleteTags) {
    console.log("🔖  corresponding tags also will be deleted");
  }

  const deletePrereleaseOnly = process.env.INPUT_DELETE_PRERELEASE_ONLY === "true";
  if (deletePrereleaseOnly) {
    console.log("🔖  Remove only prerelease");
  }

  const deletePatternStr = process.env.INPUT_DELETE_TAG_PATTERN || "";
  let deletePattern = new RegExp("");
  if (deletePatternStr) {
    console.log(`releases matching ${deletePatternStr} will be targeted`);
    deletePattern = new RegExp(deletePatternStr);
  }

  let keepMinDownloadCount = Number(process.env.INPUT_KEEP_MIN_DOWNLOAD_COUNTS);
  if (Number.isNaN(keepMinDownloadCount) || keepMinDownloadCount < 0) {
    keepMinDownloadCount = 0;
  }

  if (keepMinDownloadCount === 0) {
    console.warn("🌶  given `keep_min_download_counts` is 0, this will not enable the download count removal rule");
  } else {
    console.log(`🌶  given \`keep_min_download_counts\` is ${keepMinDownloadCount}, this will continue to add the download count deletion rule to the original deletion rule`);
  }

  let deleteExpiredData = Number(process.env.INPUT_DELETE_EXPIRED_DATA);
  if (Number.isNaN(deleteExpiredData) || deleteExpiredData < 0) {
    deleteExpiredData = 0;
  }
  console.log(`🌶  given \`delete_expired_data\` is ${deleteExpiredData}`);

  const gitHubRestApi = process.env.INPUT_GITHUB_REST_API_URL || "api.github.com";

  return {
    token: process.env.GITHUB_TOKEN,
    owner,
    repo,
    keepLatest,
    shouldDeleteTags,
    deletePrereleaseOnly,
    deletePatternStr,
    deletePattern,
    keepMinDownloadCount,
    deleteExpiredData,
    gitHubRestApi
  };
}

/**
 * 获取请求的基础选项
 * (Gets the base options for HTTP requests)
 * @param {Object} config - 配置对象 (Configuration object)
 * @returns {Object} HTTP 选项 (HTTP options)
 */
function getCommonOpts(config) {
  return {
    host: config.gitHubRestApi,
    port: 443,
    protocol: "https:",
    auth: `user:${config.token}`,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "node.js",
    },
  };
}

/**
 * 获取所有相关的 Release 数据
 * (Fetches all relevant release data from GitHub API)
 * @param {Object} config - 配置对象 (Configuration object)
 * @returns {Promise<Array>} 包含 Release 信息的数组 (Array of releases)
 */
async function fetchAllReleases(config) {
  const commonOpts = getCommonOpts(config);
  const releasesData = [];
  let page = 1;
  let hasMorePages = true;
  
  while (hasMorePages) {
    const pageData = await fetch({
      ...commonOpts,
      path: `/repos/${config.owner}/${config.repo}/releases?per_page=100&page=${page}`,
      method: "GET",
    });
    
    if (pageData.length === 0) {
      hasMorePages = false;
    } else {
      releasesData.push(...pageData);
      page++;
    }
  }
  return releasesData;
}

/**
 * 根据策略过滤出需要保留/删除的 Release
 * (Filters out releases based on rules like regex, latest count, downloads, and expiration)
 * @param {Array} data - 获取到的所有 Releases (All fetched releases)
 * @param {Object} config - 配置对象 (Configuration object)
 * @returns {Array} 准备删除的 Release 列表 (List of releases to delete)
 */
function filterReleasesToDelete(data, config) {
  // 1. 初步匹配正则表达式和预发布标签 (Initial matching for prerelease and regex patterns)
  const activeMatchedReleases = data.filter((item) => {
    if (config.deletePrereleaseOnly) {
      if (config.deletePatternStr) {
        return !item.draft && item.prerelease && item.tag_name.match(config.deletePattern);
      } else {
        return !item.draft && item.prerelease;
      }
    } else {
      if (config.deletePatternStr) {
        return !item.draft && item.tag_name.match(config.deletePattern);
      } else {
        return !item.draft;
      }
    }
  });

  if (activeMatchedReleases.length === 0) {
    return [];
  }

  const matchingLoggingAddition = config.deletePatternStr.length > 0 ? " matching" : "";
  const typeLog = config.deletePrereleaseOnly ? "prerelease(s)" : "release(s)";
  console.log(`💬  found total of ${activeMatchedReleases.length}${matchingLoggingAddition} active ${typeLog}`);

  // 2. 排序并剔除需要保留的最新 N 个 (Sort and exclude the latest N releases)
  let releaseIdsAndTags = activeMatchedReleases
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))
    .map(item => {
      const totalDownloads = item.assets.reduce((sum, asset) => sum + asset.download_count, 0);
      return {
        id: item.id,
        tagName: item.tag_name,
        published_at: item.published_at,
        download_counts: totalDownloads
      };
    })
    .slice(config.keepLatest);

  // 3. 应用高级过滤规则: 下载量和过期时间 (Apply advanced filtering rules: min downloads & expiration)
  const currentDate = new Date();
  
  if (config.keepMinDownloadCount !== 0) {
    if (config.deleteExpiredData !== 0) {
      releaseIdsAndTags = releaseIdsAndTags.filter(item => {
        const publishedDate = new Date(item.published_at);
        const daysDifference = Math.floor((currentDate - publishedDate) / (1000 * 3600 * 24)); 
        return item.download_counts < config.keepMinDownloadCount || daysDifference > config.deleteExpiredData;
      });
    } else {
      releaseIdsAndTags = releaseIdsAndTags.filter(item => item.download_counts < config.keepMinDownloadCount);
    }
  } else {
    if (config.deleteExpiredData !== 0) {
      releaseIdsAndTags = releaseIdsAndTags.filter(item => {
        const publishedDate = new Date(item.published_at);
        const daysDifference = Math.floor((currentDate - publishedDate) / (1000 * 3600 * 24));
        return daysDifference > config.deleteExpiredData;
      });
    }
  }

  return releaseIdsAndTags;
}

/**
 * 遍历并删除目标 Release 以及其 Tags
 * (Iterates and deletes target releases and their associated tags)
 * @param {Array} targetReleases - 准备删除的 Release 列表 (List of releases to delete)
 * @param {Object} config - 配置对象 (Configuration object)
 * @returns {Promise<boolean>} 是否发生错误 (Returns true if any error occurred)
 */
async function deleteTargetReleases(targetReleases, config) {
  const commonOpts = getCommonOpts(config);
  let hasError = false;

  for (let i = 0; i < targetReleases.length; i++) {
    const { id: releaseId, tagName } = targetReleases[i];

    try {
      console.log(`starting to delete ${tagName} with id ${releaseId}`);

      // 删除 Release (Delete release)
      await fetch({
        ...commonOpts,
        path: `/repos/${config.owner}/${config.repo}/releases/${releaseId}`,
        method: "DELETE",
      });

      // 如果需要，一并删除 Tag (Delete tag if required)
      if (config.shouldDeleteTags) {
        try {
          // 修复了安全隐患: encodeURI -> encodeURIComponent
          await fetch({
            ...commonOpts,
            path: `/repos/${config.owner}/${config.repo}/git/refs/tags/${encodeURIComponent(tagName)}`,
            method: "DELETE",
          });
        } catch (error) {
          console.error(`🌶  failed to delete tag "${tagName}"  <- ${error.message}`);
          hasError = true;
          break;
        }
      }
    } catch (error) {
      console.error(`🌶  failed to delete release with id "${releaseId}"  <- ${error.message}`);
      hasError = true;
      break;
    }
  }

  return hasError;
}

/**
 * 主入口函数
 * (Main entry function)
 */
async function run() {
  try {
    const config = getConfig();
    
    // 获取 Releases (Fetch releases)
    const allReleases = await fetchAllReleases(config);
    
    // 过滤 Releases (Filter releases)
    const targetReleases = filterReleasesToDelete(allReleases, config);
    
    if (targetReleases.length === 0) {
      console.log(`😕  no older releases found. exiting...`);
      return;
    }
    
    console.log(`🍻  found ${targetReleases.length} older release(s)`);
    
    // 执行删除操作 (Execute deletion)
    const hasError = await deleteTargetReleases(targetReleases, config);
    
    if (hasError) {
      process.exitCode = 1;
      return;
    }
    
    console.log(`👍🏼  ${targetReleases.length} older release(s) deleted successfully!`);
    
  } catch (error) {
    console.error(`🌶  Error: ${error.message}`);
    console.error(`exiting...`);
    process.exitCode = 1;
  }
}

// 启动执行 (Start execution)
run();
