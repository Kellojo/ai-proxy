## Requirements

- add support for configuring multiple providers
  - Providers consist of endpoint url and api key/token
  - Should support OpenAI, anthropic and other api variants
  - Have the option to send a wake on lan packet to wake up non cloud providers, prior to making any request (add option for this during provider config)
- add support for enforcing virtual keys for api usage
- Add virtual api keys, which can be managed in the ui (crud, + reroll)
- The proxy should expose OpenAI api spec under /api/proxy/openai
  - In the future additional api formats may be required
- Add simplistic statistics around model and provider usage, as well as requests over time (with response code for debugging purposes)
- Keep the ui very minimalistic

## Tech Stack

Use the below tech stack:

- svelte kit for the ui
- Typescript for the backend service
- Persist any data in a SQLite db for portability
- Make the whole thing package-able able as a lightweight docker container with minimal configuration

## Additional Considerations
- Keep the code modular and well organized to allow for easy maintenance and future enhancements.
- Adhere to best practices for both frontend and backend development.
- Ensure that the application is secure, especially when handling API keys and user data.
