using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Clases.Modelos
{
    public class Consulta
    {
        public int ID { get; set; }

        public DateTime FechaTurno { get; set; }
        public string Motivo { get; set; }

        public Tipo Tipo_Consulta { get; set; }
        // Relaciones
        public int MascotaId { get; set; }
        public Mascota Mascota { get; set; }

        public int VacunaId { get; set; } 
        public List<Vacuna> Vacunas { get; set; } = new List<Vacuna>();
        public int HistorialMedicoId { get; set; }
        public HistorialMedico HistorialMedico { get; set; }
        public int VeterinarioId { get; set; }
        public Veterinario Veterinario { get; set; }


        // Enumeraciones
        public enum Tipo
        {
            General,
            Urgencia,
            Especialista
        }

    }
}
