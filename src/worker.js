export default {
  async fetch(request, env) {
    // Sirve los archivos estáticos desde la carpeta public/
    return env.ASSETS.fetch(request);
  }
};
