using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Clases.Modelos
{
    public class Duenio : Usuario
    {
        public int ID { get; set; }
        
        public List<Mascota> Mascotas { get; set; } = new List<Mascota>();
        
    }
}
