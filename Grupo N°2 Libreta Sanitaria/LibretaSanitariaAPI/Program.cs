using Microsoft.EntityFrameworkCore;
using System.Text.Json.Serialization;
using LibretaSanitariaAPI.Datos;
using LibretaSanitariaAPI.Repositorios;
using LibretaSanitariaAPI.Logica;
using LibretaSanitariaAPI.Endpoints;

var builder = WebApplication.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

builder.Services.AddDbContext<LibretaDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Default")));

builder.Services.AddScoped<IDuenioRepositorio, DuenioRepositorio>();
builder.Services.AddScoped<IVeterinarioRepositorio, VeterinarioRepositorio>();
builder.Services.AddScoped<IMascotaRepositorio, MascotaRepositorio>();
builder.Services.AddScoped<IConsultaRepositorio, ConsultaRepositorio>();
builder.Services.AddScoped<IVacunaRepositorio, VacunaRepositorio>();
builder.Services.AddScoped<IHistorialRepositorio, HistorialRepositorio>();
builder.Services.AddScoped<IRecordatorioRepositorio, RecordatorioRepositorio>();

builder.Services.AddScoped<IDuenioLogica, DuenioLogica>();
builder.Services.AddScoped<IVeterinarioLogica, VeterinarioLogica>();
builder.Services.AddScoped<IMascotaLogica, MascotaLogica>();
builder.Services.AddScoped<IConsultaLogica, ConsultaLogica>();
builder.Services.AddScoped<IVacunaLogica, VacunaLogica>();
builder.Services.AddScoped<IHistorialLogica, HistorialLogica>();
builder.Services.AddScoped<IRecordatorioLogica, RecordatorioLogica>();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<LibretaDbContext>();
    db.Database.Migrate();
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.MapDueniosEndpoints();
app.MapVeterinariosEndpoints();
app.MapMascotasEndpoints();
app.MapConsultasEndpoints();
app.MapVacunasEndpoints();
app.MapHistorialEndpoints();
app.MapRecordatoriosEndpoints();
app.MapVetEndpoints();

app.Run();
