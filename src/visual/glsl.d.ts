// Los shaders se importan como texto: `import src from './x.glsl?raw'`.
declare module '*.glsl?raw' {
  const src: string
  export default src
}
