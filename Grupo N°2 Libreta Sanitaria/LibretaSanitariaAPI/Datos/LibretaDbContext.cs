using Microsoft.EntityFrameworkCore;
using LibretaSanitariaAPI.Modelos;

namespace LibretaSanitariaAPI.Datos
{
    public class LibretaDbContext : DbContext
    {
        public LibretaDbContext(DbContextOptions<LibretaDbContext> options) : base(options)
        {
        }

        public DbSet<Duenio> Duenios { get; set; }
        public DbSet<Veterinario> Veterinarios { get; set; }
        public DbSet<Mascota> Mascotas { get; set; }
        public DbSet<Consulta> Consultas { get; set; }
        public DbSet<Vacuna> Vacunas { get; set; }
        public DbSet<HistorialMedico> HistorialesMedicos { get; set; }
        public DbSet<Recordatorio> Recordatorios { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<Usuario>()
                .HasDiscriminator<string>("TipoUsuario")
                .HasValue<Duenio>("Duenio")
                .HasValue<Veterinario>("Veterinario");

            modelBuilder.Entity<Consulta>()
                .HasOne(c => c.Veterinario)
                .WithMany(v => v.Consultas)
                .HasForeignKey(c => c.VeterinarioId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<HistorialMedico>()
                .HasMany(h => h.Veterinarios)
                .WithMany(v => v.HistorialesMedicos)
                .UsingEntity<Dictionary<string, object>>(
                    "HistorialVeterinario",
                    j => j.HasOne<Veterinario>().WithMany().HasForeignKey("VeterinariosID").OnDelete(DeleteBehavior.Restrict),
                    j => j.HasOne<HistorialMedico>().WithMany().HasForeignKey("HistorialesMedicosID").OnDelete(DeleteBehavior.Cascade));
        }
    }
}
