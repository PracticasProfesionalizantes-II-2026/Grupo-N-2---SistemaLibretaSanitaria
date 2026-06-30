using LibretaSanitariaAPI.DTOs;
using LibretaSanitariaAPI.Logica;

namespace LibretaSanitariaAPI.Endpoints
{
    public static class VetEndpoints
    {
        public static void MapVetEndpoints(this WebApplication app)
        {
            app.MapGet("/api/vet/{vetId}/consultas", (int vetId, IConsultaLogica consultaLogica, IVeterinarioLogica vetLogica) =>
            {
                var vet = vetLogica.GetById(vetId);
                if (vet is null) return Results.NotFound("Veterinario no encontrado.");

                var consultas = consultaLogica.GetByVetId(vetId);
                var resultado = consultas.Select(c => new ConsultaResponse(c.ID, c.FechaTurno, c.Motivo, c.Tipo, c.MascotaId, c.Mascota?.Nombre ?? string.Empty, c.VeterinarioId, $"{vet.Nombre} {vet.Apellido}"));
                return Results.Ok(resultado);
            });

            app.MapGet("/api/vet/{vetId}/mascotas", (int vetId, IMascotaLogica mascotaLogica, IVeterinarioLogica vetLogica) =>
            {
                var vet = vetLogica.GetById(vetId);
                if (vet is null) return Results.NotFound("Veterinario no encontrado.");

                var mascotas = mascotaLogica.GetByVetId(vetId);
                var resultado = mascotas.Select(m => new MascotaResponse(m.ID, m.Nombre, m.Especie, m.Raza, m.Sexo, m.FechaNacimiento, m.Peso, m.QR, m.DuenioId, $"{m.Duenio?.Nombre} {m.Duenio?.Apellido}"));
                return Results.Ok(resultado);
            });
        }
    }
}
