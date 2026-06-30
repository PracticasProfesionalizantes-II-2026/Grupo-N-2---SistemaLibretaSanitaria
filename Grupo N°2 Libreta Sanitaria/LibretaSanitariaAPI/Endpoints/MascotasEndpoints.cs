using LibretaSanitariaAPI.DTOs;
using LibretaSanitariaAPI.Logica;
using LibretaSanitariaAPI.Modelos;

namespace LibretaSanitariaAPI.Endpoints
{
    public static class MascotasEndpoints
    {
        private static MascotaResponse ToResponse(Mascota m) =>
            new(m.ID, m.Nombre, m.Especie, m.Raza, m.Sexo, m.FechaNacimiento, m.Peso, m.QR, m.DuenioId, $"{m.Duenio?.Nombre} {m.Duenio?.Apellido}");

        public static void MapMascotasEndpoints(this WebApplication app)
        {
            app.MapGet("/api/mascotas", (IMascotaLogica logica) =>
            {
                var mascotas = logica.GetAll();
                return Results.Ok(mascotas.Select(ToResponse));
            });

            app.MapGet("/api/mascotas/{id}", (int id, IMascotaLogica logica) =>
            {
                var mascota = logica.GetById(id);
                if (mascota is null) return Results.NotFound();
                return Results.Ok(ToResponse(mascota));
            });

            app.MapGet("/api/mascotas/duenio/{duenioId}", (int duenioId, IMascotaLogica logica, IDuenioLogica duenioLogica) =>
            {
                var duenio = duenioLogica.GetById(duenioId);
                if (duenio is null) return Results.NotFound("Duenio no encontrado.");

                var mascotas = logica.GetByDuenioId(duenioId);
                return Results.Ok(mascotas.Select(ToResponse));
            });

            app.MapPost("/api/mascotas", (MascotaRequest dto, IMascotaLogica logica, IDuenioLogica duenioLogica) =>
            {
                if (string.IsNullOrEmpty(dto.Nombre) || string.IsNullOrEmpty(dto.Especie))
                    return Results.BadRequest("Nombre y Especie son obligatorios.");

                var duenio = duenioLogica.GetById(dto.DuenioId);
                if (duenio is null) return Results.NotFound("El duenio indicado no existe.");

                var mascota = new Mascota
                {
                    Nombre = dto.Nombre, Especie = dto.Especie, Raza = dto.Raza,
                    Sexo = dto.Sexo, FechaNacimiento = dto.FechaNacimiento, Peso = dto.Peso,
                    DuenioId = dto.DuenioId
                };
                logica.Add(mascota);
                mascota.Duenio = duenio;
                return Results.Created($"/api/mascotas/{mascota.ID}", ToResponse(mascota));
            });

            app.MapPut("/api/mascotas/{id}", (int id, MascotaRequest dto, IMascotaLogica logica) =>
            {
                var mascota = logica.GetById(id);
                if (mascota is null) return Results.NotFound();

                mascota.Nombre = dto.Nombre; mascota.Especie = dto.Especie; mascota.Raza = dto.Raza;
                mascota.Sexo = dto.Sexo; mascota.FechaNacimiento = dto.FechaNacimiento; mascota.Peso = dto.Peso;
                logica.Update(mascota);
                return Results.NoContent();
            });

            app.MapDelete("/api/mascotas/{id}", (int id, IMascotaLogica logica) =>
            {
                var mascota = logica.GetById(id);
                if (mascota is null) return Results.NotFound();

                logica.Delete(id);
                return Results.NoContent();
            });
        }
    }
}
