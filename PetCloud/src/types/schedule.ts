export type ReminderRepeat =
  "una-vez" | "diaria" | "semanal" | "mensual" | "anual";

export type ReminderStatus = "activo" | "cumplido" | "vencido";

export type Reminder = {
  id: string;
  petId: string;
  titulo: string;
  descripcion: string;
  fecha: string;
  hora: string;
  repeticion: ReminderRepeat;
  canales: ("push" | "email")[];
  estado: ReminderStatus;
};
