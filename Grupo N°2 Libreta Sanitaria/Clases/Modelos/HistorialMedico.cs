using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Clases.Modelos
{
    public class HistorialMedico
    {
        [Key] public int ID { get; set; }
        public string? Descripcion { get; set; }
        public Tratamiento_Realizado Tratamiento { get; set; }

        public Tipo_Consulta TipoConsulta { get; set; } 


        // Relaciones
        public int MascotaId { get; set; }
        public Mascota Mascota { get; set; }
        public List<Veterinario> Veterinarios { get; set; } = new List<Veterinario>();
        public List<Consulta> Consultas { get; set; } = new List<Consulta>();



        // Enumeraciones
        public enum Tratamiento_Realizado 
        {
            Ninguno,
            Medicacion,
            Cirugia,
            Terapia
        }
        public enum Tipo_Consulta
        {
            General,
            Urgencia,
            Especialista
        }
    }
}
