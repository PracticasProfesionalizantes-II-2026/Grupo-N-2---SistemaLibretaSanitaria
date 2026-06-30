using LibretaSanitariaAPI.DTOs;
using LibretaSanitariaAPI.Logica;
using LibretaSanitariaAPI.Modelos;

namespace LibretaSanitariaAPI.Endpoints
{
    public static class HistorialEndpoints
    {
        private static HistorialResponse ToResponse(HistorialMedico h) =>
            new(h.ID, h.Descripcion, h.TratamientoRealizado, h.TipoConsulta, h.MascotaId, h.Mascota?.Nombre ?? string.Empty);

        public static void MapHistorialEndpoints(this WebApplication app)
        {
            app.MapGet("/api/historial", (IHistorialLogica logica) =>
            {
                var historiales = logica.GetAll();
                return Results.Ok(historiales.Select(ToResponse));
            });

            app.MapGet("/api/historial/{id}", (int id, IHistorialLogica logica) =>
            {
                var historial = logica.GetById(id);
                if (historial is null) return Results.NotFound();
                return Results.Ok(ToResponse(historial));
            });

            app.MapGet("/api/historial/mascota/{mascotaId}", (int mascotaId, IHistorialLogica logica) =>
            {
                var historiales = logica.GetByMascotaId(mascotaId);
                return Results.Ok(historiales.Select(ToResponse));
            });

            app.MapPost("/api/historial", (HistorialRequest dto, IHistorialLogica logica, IMascotaLogica mascotaLogica) =>
            {
                var mascota = mascotaLogica.GetById(dto.MascotaId);
                if (mascota is null) return Results.NotFound("La mascota indicada no existe.");

                var historial = new HistorialMedico
                {
                    Descripcion = dto.Descripcion, TratamientoRealizado = dto.TratamientoRealizado,
                    TipoConsulta = dto.TipoConsulta, MascotaId = dto.MascotaId
                };
                logica.Add(historial);
                historial.Mascota = mascota;
                return Results.Created($"/api/historial/{historial.ID}", ToResponse(historial));
            });

            app.MapPut("/api/historial/{id}", (int id, HistorialRequest dto, IHistorialLogica logica) =>
            {
                var historial = logica.GetById(id);
                if (historial is null) return Results.NotFound();

                historial.Descripcion = dto.Descripcion;
                historial.TratamientoRealizado = dto.TratamientoRealizado;
                historial.TipoConsulta = dto.TipoConsulta;
                logica.Update(historial);
                return Results.NoContent();
            });

            app.MapDelete("/api/historial/{id}", (int id, IHistorialLogica logica) =>
            {
                var historial = logica.GetById(id);
                if (historial is null) return Results.NotFound();

                logica.Delete(id);
                return Results.NoContent();
            });
        }
    }
}
