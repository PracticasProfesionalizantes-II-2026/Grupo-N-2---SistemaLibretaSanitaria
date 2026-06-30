using LibretaSanitariaAPI.DTOs;
using LibretaSanitariaAPI.Logica;
using LibretaSanitariaAPI.Modelos;

namespace LibretaSanitariaAPI.Endpoints
{
    public static class DueniosEndpoints
    {
        public static void MapDueniosEndpoints(this WebApplication app)
        {
            app.MapGet("/api/duenios", (IDuenioLogica logica) =>
            {
                var duenios = logica.GetAll();
                var resultado = duenios.Select(d => new DuenioResponse(d.ID, d.Nombre, d.Apellido, d.Email));
                return Results.Ok(resultado);
            });

            app.MapGet("/api/duenios/{id}", (int id, IDuenioLogica logica) =>
            {
                var duenio = logica.GetById(id);
                if (duenio is null) return Results.NotFound();
                return Results.Ok(new DuenioResponse(duenio.ID, duenio.Nombre, duenio.Apellido, duenio.Email));
            });

            app.MapPost("/api/duenios", (DuenioRequest dto, IDuenioLogica logica) =>
            {
                if (string.IsNullOrEmpty(dto.Nombre) || string.IsNullOrEmpty(dto.Email))
                    return Results.BadRequest("Nombre y Email son obligatorios.");

                var duenio = new Duenio { Nombre = dto.Nombre, Apellido = dto.Apellido, Email = dto.Email };
                logica.Add(duenio);
                return Results.Created($"/api/duenios/{duenio.ID}", new DuenioResponse(duenio.ID, duenio.Nombre, duenio.Apellido, duenio.Email));
            });

            app.MapPut("/api/duenios/{id}", (int id, DuenioRequest dto, IDuenioLogica logica) =>
            {
                var duenio = logica.GetById(id);
                if (duenio is null) return Results.NotFound();

                duenio.Nombre = dto.Nombre;
                duenio.Apellido = dto.Apellido;
                duenio.Email = dto.Email;
                logica.Update(duenio);
                return Results.NoContent();
            });

            app.MapDelete("/api/duenios/{id}", (int id, IDuenioLogica logica) =>
            {
                var duenio = logica.GetById(id);
                if (duenio is null) return Results.NotFound();

                logica.Delete(id);
                return Results.NoContent();
            });
        }
    }
}
