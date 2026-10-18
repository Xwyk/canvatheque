// Les modules serveur journalisent : silence pendant les tests unitaires.
process.env.LOG_LEVEL ??= "silent";
