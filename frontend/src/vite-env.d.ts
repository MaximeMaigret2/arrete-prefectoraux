/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.topojson?url' {
  // Vite ne reconnaît pas nativement l'extension .topojson : l'import doit
  // utiliser le suffixe explicite `?url` (Explicit URL Imports) pour obtenir
  // l'URL publique du fichier, chargée à l'exécution par `react-simple-maps`
  // (Geographies accepte une URL ou un objet TopoJSON). Un import sans ce
  // suffixe fait échouer le bundling : Rollup/esbuild tentent de parser le
  // contenu JSON comme du JavaScript.
  const url: string;
  export default url;
}
