/* ==================================================================
   js/core/vocab.js
   Propósito : Vocabulario por tipo de negocio (cómo se llama a quien se atiende).
               Permite reutilizar Agendia en spa, barbería, clínica u otro rubro
               sin tocar el código de las vistas.
   Depende de: state.js (T)
   La usan   : render.js y todas las vistas con textos de "clienta/cliente"
   Cómo agregar un rubro: añadir una entrada a VOCAB (no hay que tocar nada más).
   ================================================================== */
const VOCAB = {
  spa:      {label: "Spa / estética",        c: "clienta",  C: "Clienta",  cs: "clientas",  Cs: "Clientas",  un: "una", nuevo: "Nueva",  nuevas: "nuevas"},
  barberia: {label: "Barbería / peluquería", c: "cliente",  C: "Cliente",  cs: "clientes",  Cs: "Clientes",  un: "un",  nuevo: "Nuevo",  nuevas: "nuevos"},
  clinica:  {label: "Clínica / consultorio", c: "paciente", C: "Paciente", cs: "pacientes", Cs: "Pacientes", un: "un",  nuevo: "Nuevo",  nuevas: "nuevos"},
  general:  {label: "Otro negocio",          c: "cliente",  C: "Cliente",  cs: "clientes",  Cs: "Clientes",  un: "un",  nuevo: "Nuevo",  nuevas: "nuevos"}
};
/** Vocabulario de la empresa activa (por defecto "spa", como era antes). */
const V = () => VOCAB[(T && T.settings && T.settings.vocab) || "spa"] || VOCAB.spa;
