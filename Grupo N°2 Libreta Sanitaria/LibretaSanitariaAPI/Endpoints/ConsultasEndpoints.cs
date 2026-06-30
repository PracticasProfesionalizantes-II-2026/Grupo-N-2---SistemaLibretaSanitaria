using LibretaSanitariaAPI.DTOs;
using LibretaSanitariaAPI.Logica;
using LibretaSanitariaAPI.Modelos;

namespace LibretaSanitariaAPI.Endpoints
{
    public static class ConsultasEndpoints
    {
        private static ConsultaResponse ToResponse(Consulta c) =>
            new(c.ID, c.FechaTurno, c.Motivo, c.Tipo, c.MascotaId, c.Mascota?.Nombre ?? string.Empty, c.VeterinarioId, $"{c.Veterinario?.Nombre} {c.Veterinario?.Apellido}");

        public static void MapConsultasEndpoints(this WebApplication app)
        {
            app.MapGet("/api/consultas", (IConsultaLogica logica) =>
            {
                var consultas = logica.GetAll();
                return Results.Ok(consultas.Select(ToResponse));
            });

            app.MapGet("/api/consultas/{id}", (int id, IConsultaLogica logica) =>
            {
                var consulta = logica.GetById(id);
                if (consulta is null) return Results.NotFound();
                return Results.Ok(ToResponse(consulta));
            });

            app.MapGet("/api/consultas/mascota/{mascotaId}", (int mascotaId, IConsultaLogica logica) =>
            {
                var consultas = logica.GetByMascotaId(mascotaId);
                return Results.Ok(consultas.Select(ToResponse));
            });

            app.MapPost("/api/consultas", (ConsultaRequest dto, IConsultaLogica logica, IMascotaLogica mascotaLogica, IVeterinarioLogica vetLogica) =>
            {
                if (string.IsNullOrEmpty(dto.Motivo))
                    return Results.BadRequest("El motivo es obligatorio.");

                var mascota = mascotaLogica.GetById(dto.MascotaId);
                if (mascota is null) return Results.NotFound("La mascota indicada no existe.");

                var vet = vetLogica.GetById(dto.VeterinarioId);
                if (vet is null) return Results.NotFound("El veterinario indicado no existe.");

                var consulta = new Consulta
                {
                    FechaTurno = dto.FechaTurno, Motivo = dto.Motivo, Tipo = dto.Tipo,
                    MascotaId = dto.MascotaId, VeterinarioId = dto.VeterinarioId
                };
                logica.Add(consulta);
                consulta.Mascota = mascota;
                consulta.Veterinario = vet;
                return Results.Created($"/api/consultas/{consulta.ID}", ToResponse(consulta));
            });

            app.MapPut("/api/consultas/{id}", (int id, ConsultaRequest dto, IConsultaLogica logica) =>
            {
                var consulta = logica.GetById(id);
                if (consulta is null) return Results.NotFound();

                consulta.FechaTurno = dto.FechaTurno;
                consulta.Motivo = dto.Motivo;
                consulta.Tipo = dto.Tipo;
                logica.Update(consulta);
                return Results.NoContent();
            });

            app.MapDelete("/api/consultas/{id}", (int id, IConsultaLogica logica) =>
            {
                var consulta = logica.GetById(id);
                if (consulta is null) return Results.NotFound();

                logica.Delete(id);
                return Results.NoContent();
            });
        }
    }
}
