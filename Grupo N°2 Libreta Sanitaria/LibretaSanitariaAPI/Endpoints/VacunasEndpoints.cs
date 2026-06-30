using LibretaSanitariaAPI.DTOs;
using LibretaSanitariaAPI.Logica;
using LibretaSanitariaAPI.Modelos;

namespace LibretaSanitariaAPI.Endpoints
{
    public static class VacunasEndpoints
    {
        private static VacunaResponse ToResponse(Vacuna v) =>
            new(v.ID, v.Nombre, v.Dosis, v.Tipo, v.ConsultaId);

        public static void MapVacunasEndpoints(this WebApplication app)
        {
            app.MapGet("/api/vacunas", (IVacunaLogica logica) =>
            {
                var vacunas = logica.GetAll();
                return Results.Ok(vacunas.Select(ToResponse));
            });

            app.MapGet("/api/vacunas/{id}", (int id, IVacunaLogica logica) =>
            {
                var vacuna = logica.GetById(id);
                if (vacuna is null) return Results.NotFound();
                return Results.Ok(ToResponse(vacuna));
            });

            app.MapGet("/api/vacunas/consulta/{consultaId}", (int consultaId, IVacunaLogica logica) =>
            {
                var vacunas = logica.GetByConsultaId(consultaId);
                return Results.Ok(vacunas.Select(ToResponse));
            });

            app.MapPost("/api/vacunas", (VacunaRequest dto, IVacunaLogica logica, IConsultaLogica consultaLogica) =>
            {
                if (string.IsNullOrEmpty(dto.Nombre))
                    return Results.BadRequest("El nombre de la vacuna es obligatorio.");

                var consulta = consultaLogica.GetById(dto.ConsultaId);
                if (consulta is null) return Results.NotFound("La consulta indicada no existe.");

                var vacuna = new Vacuna { Nombre = dto.Nombre, Dosis = dto.Dosis, Tipo = dto.Tipo, ConsultaId = dto.ConsultaId };
                logica.Add(vacuna);
                return Results.Created($"/api/vacunas/{vacuna.ID}", ToResponse(vacuna));
            });

            app.MapPut("/api/vacunas/{id}", (int id, VacunaRequest dto, IVacunaLogica logica) =>
            {
                var vacuna = logica.GetById(id);
                if (vacuna is null) return Results.NotFound();

                vacuna.Nombre = dto.Nombre; vacuna.Dosis = dto.Dosis; vacuna.Tipo = dto.Tipo;
                logica.Update(vacuna);
                return Results.NoContent();
            });

            app.MapDelete("/api/vacunas/{id}", (int id, IVacunaLogica logica) =>
            {
                var vacuna = logica.GetById(id);
                if (vacuna is null) return Results.NotFound();

                logica.Delete(id);
                return Results.NoContent();
            });
        }
    }
}
