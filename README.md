# discourse-webhook-github

This bot is a demo for Discourse webhooks. The bot can be deployed on heroku or your server.

### envs

There are some envs you need to set up in the setting page.

- `URL`: The payload url path which the service operates on. E.g. `/discourse-webhooks`
- `PORT`: The port monitoring, if TLS `443`, otherwise 80.
- `SECRET_KEY`: Match the secret key you configured in the Discourse settings. E.g. `a_secret_key_for_webhook`
- `GITHUB_USERNAME`: The github user you are operating on. E.g. `discourse`
- `GITHUB_REPO`: The github repo you are operating on under the configured user. E.g. `discourse`
- `GITHUB_ACCESS_TOKEN`: From previous step.
- `DISCOURSE_URL`: Discourse url prefix without tailing slash. E.g. `http://meta.discourse.org`
- `DISCOURSE_CATEGORY_ID`: 
- `DISCOURSE_PARENT_CATEGORY`: 
- `DISCOURSE_SUB_CATEGORY':
- `DISCOURSE_URL`:
