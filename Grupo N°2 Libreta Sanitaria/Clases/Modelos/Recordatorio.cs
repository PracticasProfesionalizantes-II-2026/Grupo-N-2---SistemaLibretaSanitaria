using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Clases.Modelos
{
    public class Recordatorio
    {
        [Key]public int ID { get; set; }
        public string Titulo { get; set; }
        public string Descripcion { get; set; }
        public DateTime FechaProgramada { get; set; }
        public Estado estado { get; set; }

        // Relaciones
        public int MascotaId { get; set; }
        public Mascota Mascota { get; set; }


        // Enumeraciones
        public enum Estado
        {
            Pendiente,
            Completado,
            Cancelado
        }
    }
}
