# Query Params Extractor

## Deploy to main

```bash
git add .
git commit -m "your message"
git push origin main
```

## Build & deploy to gh-pages

```bash
npm run build
```

After build, push the contents of the `build/` folder to the `gh-pages` branch:

```bash
git add build -f
git commit -m "build"
git subtree push --prefix build origin gh-pages
```

Or if `gh-pages` branch already exists and you want to force update it:

```bash
npm run build

git branch -D gh-pages
git checkout --orphan gh-pages
git add build -f
git commit -m "deploy"
git push origin gh-pages --force

git checkout main
```

## One-liner script (run from main)

```bash
npm run build && git branch -D gh-pages; git checkout --orphan gh-pages && git add build -f && git commit -m "deploy" && git push origin gh-pages --force && git checkout main
```
