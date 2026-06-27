- Add login/auth requirement for admin endpoints
    - Add tests, that validate that all requests require auth and are not callable without
    - Add tests that ensure virtual key endpoints are correctly setup
    - Add OIDC support
    - Initial login should be printed out by the container
    - Add env var to disable sign up
    - Add env var to disable login via username/pw

- Add a model remapping page, that allows remapping model names like "auto", "app 2" -> vibethinker-3b, ... Should be a simple ui, allowing me to view all in one place and update them quickly. Also ensure this is used in the app itself, when loading models.

- Toasts for everything

- Try out openrouter

- Add icons for things using iconify