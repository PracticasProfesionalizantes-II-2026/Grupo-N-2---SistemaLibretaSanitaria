using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Clases.Modelos;


namespace Clases.Data
{
      public class ApplicationDbContext : DbContext
      {
        public DbSet<Mascota> Mascotas { get; set; }
        public DbSet<HistorialMedico> HistorialesMedicos { get; set; } 
        public DbSet<Consulta> Consultas { get; set; }
        public DbSet<Vacuna> Vacunas { get; set; }
        public DbSet<Duenio> Duenios_Mascotas{ get; set; }
        public DbSet<Veterinario> Veterinarios { get; set; }
        public DbSet<Recordatorio> Recordatorios{ get; set; }



        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
            {
                if (!optionsBuilder.IsConfigured)
                {
                    optionsBuilder.UseSqlServer("Server=localhost;Database=PetCloud;Trusted_Connection=True;TrustServerCertificate=True;");
                }
            }
      }
}
