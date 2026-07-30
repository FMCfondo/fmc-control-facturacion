// ESLint 9 (configuración "flat"). Next 16 eliminó el comando `next lint`,
// así que se usa el CLI de ESLint directamente: `npm run lint`.
// eslint-config-next 16 ya exporta configuración flat nativa (no hace falta FlatCompat).
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  { ignores: [".next/**", "node_modules/**", "public/**"] },
  ...(Array.isArray(nextCoreWebVitals) ? nextCoreWebVitals : [nextCoreWebVitals]),
  {
    rules: {
      // Decisión deliberada: NO se usa next/image. El optimizador de imágenes ha
      // acumulado vulnerabilidades (DoS y SSRF) y arrastra la dependencia `sharp`;
      // aquí solo se muestran el logo y el favicon, que ya pesan poco.
      "@next/next/no-img-element": "off",

      // Las cargas iniciales de datos se hacen con un useEffect que llama a una
      // función async: el setState ocurre DESPUÉS del await, no de forma síncrona,
      // así que no provoca la cascada de renders que la regla busca evitar.
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default config;
