namespace LibretaSanitariaAPI.Modelos
{
    public abstract class Usuario
    {
        public int ID { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public string Apellido { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
    }
}
