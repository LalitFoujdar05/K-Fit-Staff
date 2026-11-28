# Turn on the AI helper (simple steps)

The app already contains the "Ask K-Fit AI" button. It only works after you give the server an AI key.

1. Open FreeLLMAPI > Keys. Create/copy your API key. Also look in Playground or the docs for the "Base URL" (it ends with /v1, for example https://something.com/v1).
2. Render > your service > Environment > add 3 values:
   - AI_BASE_URL = the Base URL (ends with /v1)
   - AI_KEY      = your key
   - AI_MODEL    = auto     (or the model/chain name FreeLLMAPI shows, e.g. auto:<name>)
3. Save. Render restarts by itself.
4. Open the app > Today/Team > "Ask K-Fit AI". Tap "What is planned today?".

Optional: AI_DAILY_PER_PERSON = 40 (questions per person per day).

Safety: phone numbers are never sent to the AI. The AI only proposes changes; a person taps Confirm. Your key stays on the server.
If it says "The AI service said 401/404": the key or the Base URL is wrong. 429: free limit reached, wait.
The paid OpenAI key also works: AI_BASE_URL=https://api.openai.com/v1, AI_MODEL=gpt-4o-mini.
