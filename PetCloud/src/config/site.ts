export const siteConfig = {
  name: "PetCloud",
  tagline: "La libreta sanitaria de tu mascota, siempre con vos",
  description:
    "Registro sanitario digital, único y centralizado para dueños, veterinarias .",
  contact: {
    email: "hola@petcloud.local",
    phone: "+54 9 11 0000-0000",
    location: "Buenos Aires, Argentina",
  },
};

export const publicNav = [
  { label: "Inicio", href: "/" },
  { label: "Cómo funciona", href: "/como-funciona" },
  { label: "Para veterinarias", href: "/para-veterinarias" },
  { label: "Nosotros", href: "/nosotros" },
  { label: "Contacto", href: "/contacto" },
] as const;

export const footerNav = {
  producto: [
    { label: "Cómo funciona", href: "/como-funciona" },
    { label: "Perfil de mascota (QR)", href: "/como-funciona#qr" },
  ],
  soluciones: [
    { label: "Para dueños", href: "/como-funciona" },
    { label: "Para veterinarias", href: "/para-veterinarias" },
  ],
  empresa: [
    { label: "Nosotros", href: "/nosotros" },
    { label: "Contacto", href: "/contacto" },
  ],
  legales: [
    { label: "Términos y condiciones", href: "/legales/terminos" },
    { label: "Política de privacidad", href: "/legales/privacidad" },
    { label: "Política de cookies", href: "/legales/cookies" },
  ],
} as const;
