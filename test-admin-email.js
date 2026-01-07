require('dotenv').config();
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function testAdminEmail() {
  console.log('🧪 === TESTE DE E-MAIL ADMIN ===');
  console.log('🔑 API Key carregada?', process.env.RESEND_API_KEY ? 'SIM' : 'NÃO');
  console.log('📧 Destinatário: electricink.ie@gmail.com');
  console.log('📤 Remetente: orders@electricink.ie');
  console.log('');

  try {
    console.log('⏳ Enviando...');
    
    const result = await resend.emails.send({
      from: 'Electric Ink Orders <orders@electricink.ie>',
      to: 'electricink.ie@gmail.com',
      subject: '🧪 TESTE DIRETO - ' + new Date().toISOString(),
      html: '<h1>Teste</h1><p>Se recebeu isso, está funcionando!</p>'
    });

    console.log('');
    console.log('✅ ===== SUCESSO! =====');
    console.log('📨 ID do e-mail:', result.id);
    console.log('📨 Response completo:', JSON.stringify(result, null, 2));
    console.log('');
    console.log('👉 Agora verifique:');
    console.log('   1. Caixa de entrada de electricink.ie@gmail.com');
    console.log('   2. Pasta de SPAM');
    console.log('   3. Dashboard da Resend: https://resend.com/emails/' + result.id);
    
  } catch (error) {
    console.log('');
    console.log('❌ ===== FALHOU! =====');
    console.log('❌ Mensagem:', error.message);
    console.log('❌ Nome do erro:', error.name);
    
    if (error.response) {
      console.log('❌ Status HTTP:', error.response.status);
      console.log('❌ Dados da resposta:', JSON.stringify(error.response.data, null, 2));
    }
    
    console.log('');
    console.log('Stack completo:', error.stack);
  }
}

testAdminEmail();