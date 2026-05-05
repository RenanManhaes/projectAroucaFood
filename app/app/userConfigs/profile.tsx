import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Image,
  ImageBackground,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, db } from "@/config/firebase";
import { isAdminEmail } from "@/constants/auth/adminEmails";
import { collection, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { styles } from "@/styles/profile.styles";
import { clearLocalCartCache, syncCartWithCurrentUser } from "@/services/cart/cart";

export default function ProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; fromCheckout?: string }>();
  const [user, setUser] = useState(auth.currentUser);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [cep, setCep] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [profileData, setProfileData] = useState<{
    name?: string;
    phone?: string;
    email?: string;
    address?: string | null;
    addressNumber?: string | null;
    complement?: string | null;
    cep?: string | null;
    cpf?: string | null;
  } | null>(null);
  const isAdmin = useMemo(() => {
    return isAdminEmail(user?.email);
  }, [user]);

  const getErrorMessage = (error: unknown, fallback: string) => {
    return error instanceof Error ? error.message : fallback;
  };

  const formatCpfValue = (value: string) => {
    const digits = value.replace(/\D/g, "");
    const part1 = digits.slice(0, 3);
    const part2 = digits.slice(3, 6);
    const part3 = digits.slice(6, 9);
    const part4 = digits.slice(9, 11);
    let formatted = part1;
    if (part2) formatted += `.${part2}`;
    if (part3) formatted += `.${part3}`;
    if (part4) formatted += `-${part4}`;
    return formatted;
  };

  const resetFormFields = () => {
    setFullName("");
    setPhone("");
    setAddress("");
    setAddressNumber("");
    setComplement("");
    setCep("");
    setCpf("");
    setEmail("");
    setPassword("");
    setConfirm("");
    setConsent(false);
  };
  
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user || isAdmin) return;
      try {
        const ref = doc(collection(db, "users"), user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          setProfileData({
            name: data?.name,
            phone: data?.phone,
            email: data?.email,
            address: data?.address,
            addressNumber: data?.addressNumber,
            complement: data?.complement,
            cep: data?.cep,
            cpf: data?.cpf,
          });
        }
      } catch (err) {
        console.warn("Falha ao carregar perfil", err);
      }
    };
    fetchProfile();
  }, [user, isAdmin]);

  useEffect(() => {
    if (params.mode === "signup") {
      setMode("signup");
      setMessage(null);
      return;
    }

    if (params.mode === "login") {
      setMode("login");
      setMessage(null);
    }
  }, [params.mode]);

  const toggleMode = () => {
    setMode((prev) => (prev === "login" ? "signup" : "login"));
    setMessage(null);
    resetFormFields();
  };

  const handleSubmit = async () => {
    const trimmedEmail = email.trim();
    const trimmedPass = password.trim();
    const normalizedCpf = cpf.replace(/\D/g, "");

    if (!trimmedEmail || !trimmedPass) {
      Alert.alert("Atenção", "Preencha email e senha.");
      return;
    }

    if (trimmedPass.length < 6) {
      Alert.alert("Atenção", "A senha deve ter no mínimo 6 caracteres.");
      return;
    }

    if (mode === "signup" && (!fullName.trim() || !phone.trim())) {
      Alert.alert("Atenção", "Informe nome e celular para criar a conta.");
      return;
    }

    if (mode === "signup" && !normalizedCpf) {
      Alert.alert("Atenção", "Informe um CPF válido.");
      return;
    }

    if (mode === "signup" && (!address.trim() || !addressNumber.trim() || !cep.trim())) {
      Alert.alert("Atenção", "Endereço, número e CEP são obrigatórios.");
      return;
    }

    if (mode === "signup" && trimmedPass !== confirm.trim()) {
      Alert.alert("Atenção", "As senhas não conferem.");
      return;
    }

    if (mode === "signup" && !consent) {
      Alert.alert(
        "Atenção",
        "Para criar sua conta é necessário autorizar contato por WhatsApp e e-mail."
      );
      return;
    }

    try {
      setLoading(true);
      setMessage(null);
      let userCred;
      if (mode === "login") {
        userCred = await signInWithEmailAndPassword(auth, trimmedEmail, trimmedPass);
        await syncCartWithCurrentUser();
        setMessage("Login realizado com sucesso.");
      } else {
        userCred = await createUserWithEmailAndPassword(auth, trimmedEmail, trimmedPass);
        setMessage("Conta criada com sucesso.");
        const userInfo = {
          uid: userCred.user.uid,
          name: fullName.trim(),
          phone: phone.trim(),
          address: address.trim(),
          addressNumber: addressNumber.trim(),
          complement: complement.trim() || null,
          cep: cep.trim(),
          cpf: normalizedCpf,
          email: userCred.user.email ?? trimmedEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(doc(collection(db, "users"), userCred.user.uid), userInfo);
        setProfileData(userInfo);
        await syncCartWithCurrentUser();
      }

      const email = userCred?.user?.email?.toLowerCase();
      const isAdmin = isAdminEmail(email);
      if (isAdmin) {
        router.replace("/adminConfigs/estoque");
      } else if (params.fromCheckout === "1") {
        router.replace("/userConfigs/cart");
      }
      resetFormFields();
    } catch (err: unknown) {
      Alert.alert("Erro", getErrorMessage(err, "Não foi possível concluir a ação."));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await syncCartWithCurrentUser();
      await signOut(auth);
      await clearLocalCartCache();
      setMessage("Sessão encerrada");
      resetFormFields();
      router.replace("/");
    } catch (err: unknown) {
      Alert.alert("Erro", getErrorMessage(err, "Não foi possível sair."));
    }
  };

  if (user && isAdmin) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ImageBackground
          source={require("../../assets/images/backgroundCarne.jpeg")}
          style={styles.bg}
          imageStyle={styles.bgImage}
          blurRadius={8}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.card}>
              <Text style={styles.title}>Admin</Text>
              <Text style={styles.subtitle}>{user.email}</Text>

              <View style={{ gap: 10, marginTop: 10 }}>
                <Pressable style={[styles.button, styles.primaryBtn]} onPress={() => router.replace("/adminConfigs/estoque")}> 
                  <Text style={styles.primaryText}>Ir para painel</Text>
                </Pressable>
                <Pressable style={[styles.button, styles.secondaryBtn]} onPress={handleLogout}>
                  <Text style={styles.secondaryText}>Sair</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </ImageBackground>
      </SafeAreaView>
    );
  }

  if (user && !isAdmin) {
    const displayName = profileData?.name || user.displayName || fullName || "Nome não informado";
    const phoneNumber = profileData?.phone || user.phoneNumber || phone || "Telefone não informado";
    const profileEmail = profileData?.email || user.email || email || "Email não informado";
    const displayCpfValue = profileData?.cpf || cpf;
    const displayCpf = displayCpfValue ? formatCpfValue(displayCpfValue) : "CPF não informado";
    const displayAddress = profileData?.address || "Endereço não informado";
    const displayAddressNumber = profileData?.addressNumber || "Número não informado";
    const displayComplement = profileData?.complement || "Complemento não informado";
    const displayCep = profileData?.cep || "CEP não informado";

    return (
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ImageBackground
          source={require("../../assets/images/cartBackground.jpeg")}
          style={styles.bg}
          imageStyle={styles.bgImage}
          blurRadius={8}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={true}
          >
            <View style={styles.card}>
              <Text style={styles.title}>Meu Perfil</Text>
              <Text style={styles.subtitle}>Confira seus dados cadastrados.</Text>

              <View style={{ gap: 10, marginTop: 6 }}>
                <Text style={styles.label}>Nome</Text>
                <Text style={styles.input}>{displayName}</Text>

                <Text style={styles.label}>CPF</Text>
                <Text style={styles.input}>{displayCpf}</Text>

                <Text style={styles.label}>Telefone</Text>
                <Text style={styles.input}>{phoneNumber}</Text>

                <Text style={styles.label}>Email</Text>
                <Text style={styles.input}>{profileEmail}</Text>

                <Text style={styles.label}>Endereço</Text>
                <Text style={styles.input}>{displayAddress}</Text>

                <Text style={styles.label}>Número</Text>
                <Text style={styles.input}>{displayAddressNumber}</Text>

                <Text style={styles.label}>Complemento</Text>
                <Text style={styles.input}>{displayComplement}</Text>

                <Text style={styles.label}>CEP</Text>
                <Text style={styles.input}>{displayCep}</Text>
              </View>

              <View style={{ gap: 10, marginTop: 16 }}>
                <Pressable style={[styles.button, styles.secondaryBtn]} onPress={() => {}}>
                  <Text style={styles.secondaryText}>Alterar senha</Text>
                </Pressable>
                <Pressable style={[styles.button, styles.secondaryBtn]} onPress={handleLogout}>
                  <Text style={styles.secondaryText}>Sair</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </ImageBackground>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ImageBackground
        source={require("../../assets/images/backgroundCarne.jpeg")}
        style={styles.bg}
        imageStyle={styles.bgImage}
        blurRadius={8}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.card}>
              <Text style={styles.title}>Perfil</Text>
              <Text style={styles.subtitle}>
                {mode === "login"
                  ? "Acesse sua conta para finalizar suas compras."
                  : "Crie sua conta para salvar seu carrinho e histórico."}
              </Text>

              {mode === "signup" ? (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Nome completo</Text>
                    <TextInput
                      value={fullName}
                      onChangeText={setFullName}
                      placeholder="Seu nome"
                      placeholderTextColor="#888"
                      autoCapitalize="words"
                      style={styles.input}
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>CPF</Text>
                    <TextInput
                      value={cpf}
                      onChangeText={(text) => setCpf(formatCpfValue(text))}
                      placeholder="000.000.000-00"
                      placeholderTextColor="#888"
                      keyboardType="number-pad"
                      style={styles.input}
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Celular</Text>
                    <TextInput
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="(00) 00000-0000"
                      placeholderTextColor="#888"
                      keyboardType="phone-pad"
                      style={styles.input}
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>CEP</Text>
                    <TextInput
                      value={cep}
                      onChangeText={setCep}
                      placeholder="00000-000"
                      placeholderTextColor="#888"
                      keyboardType="number-pad"
                      style={styles.input}
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Endereço</Text>
                    <TextInput
                      value={address}
                      onChangeText={setAddress}
                      placeholder="Rua Exemplo"
                      placeholderTextColor="#888"
                      style={styles.input}
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Número</Text>
                    <TextInput
                      value={addressNumber}
                      onChangeText={setAddressNumber}
                      placeholder="123"
                      placeholderTextColor="#888"
                      keyboardType="number-pad"
                      style={styles.input}
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Complemento (opcional)</Text>
                    <TextInput
                      value={complement}
                      onChangeText={setComplement}
                      placeholder="Apto, bloco..."
                      placeholderTextColor="#888"
                      style={styles.input}
                    />
                  </View>

                  
                </>
              ) : null}

              <View style={styles.formGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="seu@email.com"
                  placeholderTextColor="#888"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={styles.input}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Senha</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    placeholderTextColor="#888"
                    secureTextEntry={!showPassword}
                    style={[styles.input, { flex: 1 }]}
                  />
                  <Pressable
                    style={styles.eyeBtn}
                    onPress={() => setShowPassword((v) => !v)}
                    hitSlop={8}
                  >
                    <Image
                      source={require("../../assets/images/senha-do-olho.png")}
                      style={styles.eyeImg}
                      resizeMode="contain"
                    />
                  </Pressable>
                </View>
              </View>

              {mode === "signup" ? (
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Confirmar senha</Text>
                  <View style={styles.inputWrap}>
                    <TextInput
                      value={confirm}
                      onChangeText={setConfirm}
                      placeholder="••••••••"
                      placeholderTextColor="#888"
                      secureTextEntry={!showConfirm}
                      style={[styles.input, { flex: 1 }]}
                    />
                    <Pressable
                      style={styles.eyeBtn}
                      onPress={() => setShowConfirm((v) => !v)}
                      hitSlop={8}
                    >
                      <Image
                        source={require("../../assets/images/senha-do-olho.png")}
                        style={styles.eyeImg}
                        resizeMode="contain"
                      />
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {mode === "signup" ? (
                <Pressable
                  style={styles.checkboxRow}
                  onPress={() => setConsent((v) => !v)}
                  hitSlop={8}
                >
                  <View style={[styles.checkboxBox, consent && styles.checkboxBoxChecked]}>
                    {consent ? <Text style={styles.checkboxMark}>✓</Text> : null}
                  </View>
                  <Text style={styles.checkboxText}>
                    Ao criar conta, autorizo receber mensagens no WhatsApp e e-mails com promoções.
                  </Text>
                </Pressable>
              ) : null}

              {message ? <Text style={styles.message}>{message}</Text> : null}

              <View style={styles.row}> 
                {mode === "login" && (
                <Text style={styles.link}>Esqueceu a senha?</Text>
                )}
              </View>

              <Pressable
                style={[styles.button, styles.primaryBtn]}
                onPress={handleSubmit}
                disabled={loading}
              >
                <Text style={styles.primaryText}>
                  {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
                </Text>
              </Pressable>

              <Pressable
                style={[styles.button, styles.secondaryBtn]}
                onPress={toggleMode}
                disabled={loading}
              >
                <Text style={styles.secondaryText}>
                  {mode === "login" ? "Criar conta" : "Já tenho conta"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </ImageBackground>
    </SafeAreaView>
  );
}

