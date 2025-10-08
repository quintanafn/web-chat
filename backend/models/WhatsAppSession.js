const supabase = require('../config/supabase');

class WhatsAppSession {
  static async create(sessionData) {
    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .insert([sessionData])
      .select();
    
    if (error) throw error;
    return data[0];
  }

  static async findById(id) {
    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      // Tratar "não encontrado" como null para permitir 404 controlado nas rotas
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }
    return data;
  }

  static async findByUserId(userId) {
    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('user_id', userId);
    
    if (error) throw error;
    return data;
  }

  static async updateStatus(id, status) {
    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .update({ status })
      .eq('id', id)
      .select();
    
    if (error) throw error;
    return data[0];
  }

  static async updateQrCode(id, qrCode) {
    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .update({ qr_code: qrCode })
      .eq('id', id)
      .select();
    
    if (error) throw error;
    return data[0];
  }

  static async delete(id) {
    const { error } = await supabase
      .from('whatsapp_sessions')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return true;
  }
}

module.exports = WhatsAppSession;
