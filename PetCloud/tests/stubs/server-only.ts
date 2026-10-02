// `server-only` corta el import fuera de un componente de servidor. En vitest
// no hay servidor de Next, así que se reemplaza por un módulo vacío: lo que se
// prueba es la lógica del módulo, no la frontera, que ya la hace cumplir el build.
export {};
