const Koa = require('koa');
const app = new Koa();
const router = require('koa-router')();
const bodyParser = require('koa-bodyparser');
const rawBody = require('raw-body');
const inflate = require('inflation');
const crypto = require('crypto');
const GitHubApi = require("github");
const Promise = require('bluebird');

const watchUrl = process.env.URL || '/discourse-webhooks';
const port = process.env.PORT || 443;
const secret = process.env.SECRET_KEY || '';
const discourseUrl = process.env.DISCOURSE_URL || '';
const discourseCategoryId = process.env.DISCOURSE_CATEGORY_ID || '';
const discourseParentCategory = process.env.DISCOURSE_PARENT_CATEGORY || '';
const discourseSubCategory = process.env.DISCOURSE_SUB_CATEGORY || '';
const discourseCategorySlug = discourseSubCategory.substring(1);
const discourseCategoryUrl = `${discourseUrl}/c/${discourseParentCategory}${discourseSubCategory}.json`;
const githubRepo = process.env.GITHUB_REPO || '';
const githubUsername = process.env.GITHUB_USERNAME || '';
const githubAccessToken = process.env.GITHUB_ACCESS_TOKEN || '';
const githubCustomHeaders = {
  'User-Agent': "discourse-webhook-bot"
}


const getContent = function (url) {
  // return new pending promise
  return new Promise((resolve, reject) => {
    // select http or https module, depending on reqested url
    const lib = url.startsWith('https') ? require('https') : require('http');
    const request = lib.get(url, (response) => {
      response.setEncoding('utf8');
      // handle http errors
      if (response.statusCode < 200 || response.statusCode > 299) {
        reject(new Error('Failed to load page, status code: ' + response.statusCode));
      }
      // temporary data holder
      const body = [];
      // on every content chunk, push it to the data array
      response.on('data', chunk => body.push(chunk));
      // we are done, resolve promise with those joined chunks
      response.on('end', () => resolve(body.join('')));
    });
    // handle connection errors of the request
    request.on('error', err => reject(err))
  })
};

/*
const getContent = function(url) {
    const lib = url.startsWith('https') ? require('https') : require('http');
    const request = lib.get(url, (response) => {
      // handle http errors
      if (response.statusCode < 200 || response.statusCode > 299) {
         return (new Error('Failed to load page, status code: ' + response.statusCode));
       }
      // temporary data holder
      const body = [];
      // on every content chunk, push it to the data array
      response.on('data', (chunk) => body.push(chunk));
      // we are done, resolve promise with those joined chunks
      response.on('end', () => { return body.join('')});
    });
    // handle connection errors of the request
    request.on('error', (err) => {return (err)})
};
*/

router.post(watchUrl, (ctx, next) => {
  const headers = ctx.request.headers;
  const body = ctx.request.body;
  const rawBody = ctx.request.rawBody;

  if (headers['x-discourse-event-type'] !== 'post') {
    ctx.body = 'No interests.';
    return next();
  }

  const hmac = crypto.createHmac('sha256', secret);
  const hash = `sha256=${hmac.update(rawBody).digest('hex')}`;
  if (hash !== headers['x-discourse-event-signature']) {
    ctx.body = 'HMAC mismatched. Malformed payload.\n';
    ctx.body += `Signature: ${headers['x-discourse-event-signature']}\n`;
    ctx.body += `Computed: ${hash}\n`;
    ctx.body += `Body: ${rawBody}`;
    return next();
  }

  if (body.topic.category_id !== parseInt(discourseCategoryId, 10)) {
    ctx.body = 'No category matched in the post.(' + body.topic.category_id + ' != ' + discourseCategoryId + ')';
    return next();
  }

  // 只關注在首篇文章內容 置頂文章順序
  // todo: 考慮從post_type篩選出README.md
  const postNumber = body.post.post_number;
  const postType = body.post.post_type;
  // if (postNumber > 1 && !(postNumber === 2 && postType === 3)) {
  if (postNumber > 1 && !(postNumber >= 2 && postType === 3)) {
    ctx.body = 'No match post number and type.(' + postNumber + '&' + postType + ')';
    return next();
  }
  const summaryRepoPath = 'SUMMARY.md';
  const introductionRepoPath = 'README.md';
  const draftKey = body.topic.draft_key;
  const topicSlug = body.topic.slug;
  let postRepoPath = '';
  console.log("topicSlug: ", topicSlug);
  console.log("discourseCategorySlug: ", discourseCategorySlug);
  // introduction 對於分類：
  if (topicSlug === discourseCategorySlug) {
    postRepoPath = introductionRepoPath;
  } else {
    postRepoPath = `${draftKey}.md`;
  } 
  console.log("postRepoPath: ", postRepoPath);
  // github setup
  const github = new GitHubApi({
    protocol: 'https',
    host: "api.github.com",
    headers: githubCustomHeaders,
    Promise: Promise,
    timeout: 5000
  });
  github.authenticate({
    type: 'oauth',
    token: githubAccessToken
  });

  let promises = [];
  let responseBody = '';

  let contentSha = '';
  let content = body.topic.post_stream.posts[0].cooked;
  // 補上上傳圖片前綴網址
  // console.log("content: ", content);
  content = content.split("<img src=\"/").join("<img src=\"" + discourseUrl + "/");
  let contentBase64 = Buffer.from(content).toString('base64');

  let summarySha = '';
  let summary = '';
  let summaryBase64 = '';

  promises.push(

    github.repos.getContent({
      user: githubUsername,
      repo: githubRepo,
      path: postRepoPath
    }).then(content => {
      console.log("content.sha: ", content.sha);
      contentSha = content.sha;

      return github.repos.updateFile({
        user: githubUsername,
        repo: githubRepo,
        path: postRepoPath,
        message: `Updates ${postRepoPath}`,
        content: contentBase64,
        sha: contentSha
      });
    }).then(res => {
      console.log("res: ", res.commit.committer.date);
      console.log("res: ", res.meta.status);
      responseBody += 'OK. updates commit complete.\n';
      console.log("responseBody: ", responseBody);
      ctx.body = responseBody;
      console.log("ooxx0: ");
      // Promise.resolve();
      console.log("ooxx1: ");
      // return next();
      console.log("ooxx2: ");
    }).catch(err => {
      console.log("err: ", err.message);
      if (err.code === 404) {

        return github.repos.createFile({
          user: githubUsername,
          repo: githubRepo,
          path: postRepoPath,
          message: `Create ${postRepoPath}`,
          content: contentBase64
        });
      } else {
        ctx.body = 'GitHub error.(' + err.message + ')';

        return next();
      }
    }).catch(err => {
      console.log("err: ", err.message);
      ctx.body = 'Github createFile error.(' + err.message + ')';

      return next();
    }).then(res => {
      if (contentSha === '') {
        console.log("res: ", res.commit.committer.date);
        console.log("res: ", res.meta.status);
        responseBody += 'OK. create commit complete.\n';
        console.log("responseBody: ", responseBody);
        ctx.body = responseBody;
        // return Promise.resolve();
        // return next();
      }
      console.log("ooxx3: ");

      return getContent(
        discourseCategoryUrl
      );
    }).then((json) => {
      // console.log("json: ", json);
      json = JSON.parse(json);
      summary = "# Summary\n\n";
      for (let i = 0; i < json.topic_list.topics.length; i++) {
  console.log("json.topic_list.topics[i].slug: ", json.topic_list.topics[i].slug);
  console.log("discourseCategorySlug: ", discourseCategorySlug);
        // introduction 對於分類：
        if (json.topic_list.topics[i].slug === discourseCategorySlug) {
          summary += "* [" + json.topic_list.topics[i].fancy_title + "](" + introductionRepoPath + ")\n";
        } else {
          summary += "* [" + json.topic_list.topics[i].fancy_title + "](topic_" + json.topic_list.topics[i].id + ".md)\n";
          // summary += "* [" + json.topic_list.topics[i].title + "](topic_" + json.topic_list.topics[i].id + ".md)\n";
        }
      }
      console.log("summary: ", summary);
      summaryBase64 = Buffer.from(summary).toString('base64');

      return github.repos.getContent({
        user: githubUsername,
        repo: githubRepo,
        path: summaryRepoPath
      });
    }).then(res => {
      summarySha = res.sha;
      console.log("summarySha: ", summarySha);

      return github.repos.updateFile({
        user: githubUsername,
        repo: githubRepo,
        path: summaryRepoPath,
        message: `Updates ${summaryRepoPath}`,
        content: summaryBase64,
        sha: summarySha
      });
    }).then(res => {
      console.log("res: ", res.commit.committer.date);
      console.log("res: ", res.meta.status);
      responseBody += 'OK. summary updates commit complete.\n';
      console.log("responseBody: ", responseBody);
      ctx.body = responseBody;
      console.log("ssxx0: ");
    })
    .catch(err => {
      console.log("err: ", err.message);
      if (err.code === 404) {

        return github.repos.createFile({
          user: githubUsername,
          repo: githubRepo,
          path: summaryRepoPath,
          message: `Create ${summaryRepoPath}`,
          content: summaryBase64
        });
      } else {
        ctx.body = 'GitHub error.(' + err.message + ')';

        return next();
      }
    })
    .catch(err => {
      console.log("err: ", err.message);
      ctx.body = 'Github createFile error.(' + err.message + ')';

      return next();
    })
    .then(res => {
      if (summarySha === '') {
        console.log("res: ", res.commit.committer.date);
        console.log("res: ", res.meta.status);
        responseBody += 'OK. summary create commit complete.\n';
        console.log("responseBody: ", responseBody);
        ctx.body = responseBody;
      }
      console.log("ssxx3: ");
    })

  );

  console.log("promises: " + promises);
  return Promise.all(
    promises
  ).then(values => {
    console.log("values: " + values);
    ctx.body = responseBody;
    return next();
  });

});

app
  .use((ctx, next) => {
    let req = ctx.req || ctx;
    let opts = {
      encoding: 'utf8',
      limit: '2mb'
    }
    rawBody(inflate(req), opts).then(str => {
      ctx.request.rawBody = str;
    });
    return next();
  })
  .use(bodyParser())
  .use(router.routes())
  .use(router.allowedMethods());

app.listen(port);
