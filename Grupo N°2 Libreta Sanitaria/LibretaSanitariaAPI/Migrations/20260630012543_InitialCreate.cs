using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LibretaSanitariaAPI.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Usuario",
                columns: table => new
                {
                    ID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Nombre = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Apellido = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Email = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    TipoUsuario = table.Column<string>(type: "nvarchar(13)", maxLength: 13, nullable: false),
                    DNI = table.Column<int>(type: "int", nullable: true),
                    Matricula = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Institucion = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Telefono = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    PaginaWeb = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Usuario", x => x.ID);
                });

            migrationBuilder.CreateTable(
                name: "Mascotas",
                columns: table => new
                {
                    ID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Nombre = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Especie = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Raza = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Sexo = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    FechaNacimiento = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Peso = table.Column<decimal>(type: "decimal(5,2)", nullable: true),
                    QR = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DuenioId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Mascotas", x => x.ID);
                    table.ForeignKey(
                        name: "FK_Mascotas_Usuario_DuenioId",
                        column: x => x.DuenioId,
                        principalTable: "Usuario",
                        principalColumn: "ID",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "HistorialesMedicos",
                columns: table => new
                {
                    ID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Descripcion = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    TratamientoRealizado = table.Column<int>(type: "int", nullable: false),
                    TipoConsulta = table.Column<int>(type: "int", nullable: false),
                    MascotaId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HistorialesMedicos", x => x.ID);
                    table.ForeignKey(
                        name: "FK_HistorialesMedicos_Mascotas_MascotaId",
                        column: x => x.MascotaId,
                        principalTable: "Mascotas",
                        principalColumn: "ID",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Recordatorios",
                columns: table => new
                {
                    ID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Titulo = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Descripcion = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    FechaProgramada = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Estado = table.Column<int>(type: "int", nullable: false),
                    MascotaId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Recordatorios", x => x.ID);
                    table.ForeignKey(
                        name: "FK_Recordatorios_Mascotas_MascotaId",
                        column: x => x.MascotaId,
                        principalTable: "Mascotas",
                        principalColumn: "ID",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Consultas",
                columns: table => new
                {
                    ID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    FechaTurno = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Motivo = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Tipo = table.Column<int>(type: "int", nullable: false),
                    MascotaId = table.Column<int>(type: "int", nullable: false),
                    VeterinarioId = table.Column<int>(type: "int", nullable: false),
                    HistorialMedicoId = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Consultas", x => x.ID);
                    table.ForeignKey(
                        name: "FK_Consultas_HistorialesMedicos_HistorialMedicoId",
                        column: x => x.HistorialMedicoId,
                        principalTable: "HistorialesMedicos",
                        principalColumn: "ID");
                    table.ForeignKey(
                        name: "FK_Consultas_Mascotas_MascotaId",
                        column: x => x.MascotaId,
                        principalTable: "Mascotas",
                        principalColumn: "ID",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Consultas_Usuario_VeterinarioId",
                        column: x => x.VeterinarioId,
                        principalTable: "Usuario",
                        principalColumn: "ID",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "HistorialVeterinario",
                columns: table => new
                {
                    HistorialesMedicosID = table.Column<int>(type: "int", nullable: false),
                    VeterinariosID = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HistorialVeterinario", x => new { x.HistorialesMedicosID, x.VeterinariosID });
                    table.ForeignKey(
                        name: "FK_HistorialVeterinario_HistorialesMedicos_HistorialesMedicosID",
                        column: x => x.HistorialesMedicosID,
                        principalTable: "HistorialesMedicos",
                        principalColumn: "ID",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_HistorialVeterinario_Usuario_VeterinariosID",
                        column: x => x.VeterinariosID,
                        principalTable: "Usuario",
                        principalColumn: "ID",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Vacunas",
                columns: table => new
                {
                    ID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Nombre = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Dosis = table.Column<int>(type: "int", nullable: false),
                    Tipo = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ConsultaId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Vacunas", x => x.ID);
                    table.ForeignKey(
                        name: "FK_Vacunas_Consultas_ConsultaId",
                        column: x => x.ConsultaId,
                        principalTable: "Consultas",
                        principalColumn: "ID",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Consultas_HistorialMedicoId",
                table: "Consultas",
                column: "HistorialMedicoId");

            migrationBuilder.CreateIndex(
                name: "IX_Consultas_MascotaId",
                table: "Consultas",
                column: "MascotaId");

            migrationBuilder.CreateIndex(
                name: "IX_Consultas_VeterinarioId",
                table: "Consultas",
                column: "VeterinarioId");

            migrationBuilder.CreateIndex(
                name: "IX_HistorialesMedicos_MascotaId",
                table: "HistorialesMedicos",
                column: "MascotaId");

            migrationBuilder.CreateIndex(
                name: "IX_HistorialVeterinario_VeterinariosID",
                table: "HistorialVeterinario",
                column: "VeterinariosID");

            migrationBuilder.CreateIndex(
                name: "IX_Mascotas_DuenioId",
                table: "Mascotas",
                column: "DuenioId");

            migrationBuilder.CreateIndex(
                name: "IX_Recordatorios_MascotaId",
                table: "Recordatorios",
                column: "MascotaId");

            migrationBuilder.CreateIndex(
                name: "IX_Vacunas_ConsultaId",
                table: "Vacunas",
                column: "ConsultaId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "HistorialVeterinario");

            migrationBuilder.DropTable(
                name: "Recordatorios");

            migrationBuilder.DropTable(
                name: "Vacunas");

            migrationBuilder.DropTable(
                name: "Consultas");

            migrationBuilder.DropTable(
                name: "HistorialesMedicos");

            migrationBuilder.DropTable(
                name: "Mascotas");

            migrationBuilder.DropTable(
                name: "Usuario");
        }
    }
}
