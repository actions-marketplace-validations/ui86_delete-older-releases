# Delete Older Releases by ui86

一个用于自动清理 GitHub 仓库中旧版本 Releases 及其相关 Tags 的 GitHub Action。经过 Google 编程规范重构，具有企业级代码质量与极佳的安全性。

## 功能特性 (Features)
- 支持保留最新的 N 个 Releases
- 支持按正则表达式匹配和删除特定的 Tags/Releases
- 支持仅删除预发布版本 (Prerelease)
- 支持按下载量阈值保留 Releases
- 支持按过期时间自动清理

## 用法 (Usage)

```yaml
name: Delete Old Releases

on:
  schedule:
    - cron: '0 0 * * *' # 每天运行一次
  workflow_dispatch:

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - name: Delete older releases
        uses: ui86/delete-older-releases@v1
        with:
          keep_latest: 5
          delete_tags: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## 配置项 (Inputs)

| 参数 | 必填 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `keep_latest` | **是** | - | 保留的最新 Release 数量 |
| `keep_min_download_counts` | 否 | `0` | 若旧版本下载量大于该值，则不被删除 |
| `delete_expired_data` | 否 | `0` | 删除指定天数以前的 Releases |
| `repo` | 否 | 当前仓库 | 目标仓库名称，格式 `<owner>/<repoName>` |
| `delete_tags` | 否 | `false` | 是否同时删除关联的 Git Tags |
| `delete_prerelease_only` | 否 | `false` | 是否仅删除预发布 (prerelease) 版本 |
| `delete_tag_pattern` | 否 | - | 匹配需要删除的标签正则表达式片段 |
| `github_rest_api_url` | 否 | `api.github.com` | GitHub API 地址 (适用于私有化部署的 GitHub Enterprise) |

## License
MIT
