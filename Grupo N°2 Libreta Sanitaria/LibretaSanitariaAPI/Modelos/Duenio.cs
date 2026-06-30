namespace LibretaSanitariaAPI.Modelos
{
    public class Duenio : Usuario
    {
        public List<Mascota> Mascotas { get; set; } = new List<Mascota>();
    }
}
