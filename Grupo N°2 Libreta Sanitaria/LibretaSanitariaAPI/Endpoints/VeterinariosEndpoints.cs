using LibretaSanitariaAPI.DTOs;
using LibretaSanitariaAPI.Logica;
using LibretaSanitariaAPI.Modelos;

namespace LibretaSanitariaAPI.Endpoints
{
    public static class VeterinariosEndpoints
    {
        public static void MapVeterinariosEndpoints(this WebApplication app)
        {
            app.MapGet("/api/veterinarios", (IVeterinarioLogica logica) =>
            {
                var veterinarios = logica.GetAll();
                var resultado = veterinarios.Select(v => new VeterinarioResponse(v.ID, v.Nombre, v.Apellido, v.Email, v.DNI, v.Matricula, v.Institucion, v.Telefono, v.PaginaWeb));
                return Results.Ok(resultado);
            });

            app.MapGet("/api/veterinarios/{id}", (int id, IVeterinarioLogica logica) =>
            {
                var vet = logica.GetById(id);
                if (vet is null) return Results.NotFound();
                return Results.Ok(new VeterinarioResponse(vet.ID, vet.Nombre, vet.Apellido, vet.Email, vet.DNI, vet.Matricula, vet.Institucion, vet.Telefono, vet.PaginaWeb));
            });

            app.MapPost("/api/veterinarios", (VeterinarioRequest dto, IVeterinarioLogica logica) =>
            {
                if (string.IsNullOrEmpty(dto.Nombre) || string.IsNullOrEmpty(dto.Email) || string.IsNullOrEmpty(dto.Matricula))
                    return Results.BadRequest("Nombre, Email y Matricula son obligatorios.");

                var vet = new Veterinario
                {
                    Nombre = dto.Nombre, Apellido = dto.Apellido, Email = dto.Email,
                    DNI = dto.DNI, Matricula = dto.Matricula, Institucion = dto.Institucion,
                    Telefono = dto.Telefono, PaginaWeb = dto.PaginaWeb
                };
                logica.Add(vet);
                return Results.Created($"/api/veterinarios/{vet.ID}", new VeterinarioResponse(vet.ID, vet.Nombre, vet.Apellido, vet.Email, vet.DNI, vet.Matricula, vet.Institucion, vet.Telefono, vet.PaginaWeb));
            });

            app.MapPut("/api/veterinarios/{id}", (int id, VeterinarioRequest dto, IVeterinarioLogica logica) =>
            {
                var vet = logica.GetById(id);
                if (vet is null) return Results.NotFound();

                vet.Nombre = dto.Nombre; vet.Apellido = dto.Apellido; vet.Email = dto.Email;
                vet.DNI = dto.DNI; vet.Matricula = dto.Matricula; vet.Institucion = dto.Institucion;
                vet.Telefono = dto.Telefono; vet.PaginaWeb = dto.PaginaWeb;
                logica.Update(vet);
                return Results.NoContent();
            });

            app.MapDelete("/api/veterinarios/{id}", (int id, IVeterinarioLogica logica) =>
            {
                var vet = logica.GetById(id);
                if (vet is null) return Results.NotFound();

                logica.Delete(id);
                return Results.NoContent();
            });
        }
    }
}
