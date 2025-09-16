# product page reviewer

analyzes product pages and gives ux feedback. paste a url, get analysis.

## how to run

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # on windows: .venv\Scripts\activate
pip install -r requirements.txt
echo "OPENAI_API_KEY=your_key_here" > .env
uvicorn main:app --reload
```

then go to http://localhost:8000

## what it does

- scrapes product pages for basic stuff (title, price, images, etc)
- uses ai to analyze the page and give suggestions
- shows everything in a simple dashboard

## todos

- [ ] add better error handling for weird websites
- [ ] make the dashboard look nicer
- [ ] add more heuristics for detecting product info
- [ ] maybe add a history of analyzed pages
- [ ] test with more real product pages
