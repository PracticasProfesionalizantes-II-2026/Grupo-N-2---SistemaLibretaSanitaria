using LibretaSanitariaAPI.DTOs;
using LibretaSanitariaAPI.Logica;
using LibretaSanitariaAPI.Modelos;

namespace LibretaSanitariaAPI.Endpoints
{
    public static class RecordatoriosEndpoints
    {
        private static RecordatorioResponse ToResponse(Recordatorio r) =>
            new(r.ID, r.Titulo, r.Descripcion, r.FechaProgramada, r.Estado, r.MascotaId, r.Mascota?.Nombre ?? string.Empty);

        public static void MapRecordatoriosEndpoints(this WebApplication app)
        {
            app.MapGet("/api/recordatorios", (IRecordatorioLogica logica) =>
            {
                var recordatorios = logica.GetAll();
                return Results.Ok(recordatorios.Select(ToResponse));
            });

            app.MapGet("/api/recordatorios/{id}", (int id, IRecordatorioLogica logica) =>
            {
                var recordatorio = logica.GetById(id);
                if (recordatorio is null) return Results.NotFound();
                return Results.Ok(ToResponse(recordatorio));
            });

            app.MapGet("/api/recordatorios/mascota/{mascotaId}", (int mascotaId, IRecordatorioLogica logica) =>
            {
                var recordatorios = logica.GetByMascotaId(mascotaId);
                return Results.Ok(recordatorios.Select(ToResponse));
            });

            app.MapPost("/api/recordatorios", (RecordatorioRequest dto, IRecordatorioLogica logica, IMascotaLogica mascotaLogica) =>
            {
                if (string.IsNullOrEmpty(dto.Titulo))
                    return Results.BadRequest("El titulo es obligatorio.");

                var mascota = mascotaLogica.GetById(dto.MascotaId);
                if (mascota is null) return Results.NotFound("La mascota indicada no existe.");

                var recordatorio = new Recordatorio
                {
                    Titulo = dto.Titulo, Descripcion = dto.Descripcion,
                    FechaProgramada = dto.FechaProgramada, MascotaId = dto.MascotaId,
                    Estado = EstadoRecordatorio.Pendiente
                };
                logica.Add(recordatorio);
                recordatorio.Mascota = mascota;
                return Results.Created($"/api/recordatorios/{recordatorio.ID}", ToResponse(recordatorio));
            });

            app.MapPut("/api/recordatorios/{id}", (int id, RecordatorioRequest dto, IRecordatorioLogica logica) =>
            {
                var recordatorio = logica.GetById(id);
                if (recordatorio is null) return Results.NotFound();

                recordatorio.Titulo = dto.Titulo; recordatorio.Descripcion = dto.Descripcion;
                recordatorio.FechaProgramada = dto.FechaProgramada;
                logica.Update(recordatorio);
                return Results.NoContent();
            });

            app.MapDelete("/api/recordatorios/{id}", (int id, IRecordatorioLogica logica) =>
            {
                var recordatorio = logica.GetById(id);
                if (recordatorio is null) return Results.NotFound();

                logica.Delete(id);
                return Results.NoContent();
            });
        }
    }
}
