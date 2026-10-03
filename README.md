# EI Lab website

这个目录是当前网站的部署目录。发布时应保留以下内容：

- `index.html`、`lab.html`、`publications.html`、`news.html`、`join_us.html`
- `assets/`：样式、脚本、特效依赖和背景素材
- `images/`、`paper_photo/`：人物、新闻和论文图片
- `PDF/`：原仓库收录的 11 篇论文全文，注意文件夹名是大写
- `video/`：原仓库的 4 段实验室及活动视频
- `CNAME`：原站点的自定义域名配置

## 本地预览

部分特效使用 JavaScript 模块，请通过 HTTP 预览，不要直接双击 HTML。
在本目录打开终端并运行：

```sh
python -m http.server 8765 --bind 127.0.0.1
```

然后打开 <http://127.0.0.1:8765/>。如果已有预览服务运行，直接打开地址即可。

## GitHub Pages

将本目录中的页面及资源提交到现有 Pages 发布目录，保留目录结构。
不要只提交 HTML，也不要删除原仓库的 `PDF/`、`video/` 等资源目录。
目前论文 PDF、部分图片及视频仍通过原仓库的在线地址加载。
字体也需要网络连接；这不是完全离线的网站包。

`lab-site-backup-*` 是工作目录旁的历史备份，不是新的发布版本。
